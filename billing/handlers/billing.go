// Package handlers exposes the Fiber v3 HTTP surface for the billing
// service: GET /subscription, POST /checkout-session, POST /portal-session
// and the public webhook receiver. All responses use the kernel
// {success, data, meta} envelope.
//
// Handlers are intentionally thin: each route extracts inputs from the
// request, delegates to billing.Service, and renders the result. No
// Stripe types leak past this layer.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"strings"
	"time"

	"github.com/asteby/metacore-sdk/billing"
	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserLookup returns the display name (and any other future field) for
// the caller, used as the Stripe customer name on first checkout. The
// SDK does not know about the host's User model — implement this
// interface with a 5-line adapter.
type UserLookup interface {
	NameByID(ctx context.Context, userID uuid.UUID) (string, error)
}

// nameOnly is a tiny default UserLookup that scans the host's users
// table for a column called `name`. Hosts whose schema differs should
// provide their own UserLookup.
type nameOnly struct{ db *gorm.DB }

// NewDefaultUserLookup returns a UserLookup that reads users.name. It's
// a sensible default for ops/link; hosts with a different schema should
// implement UserLookup themselves.
func NewDefaultUserLookup(db *gorm.DB) UserLookup { return &nameOnly{db: db} }

func (n *nameOnly) NameByID(ctx context.Context, userID uuid.UUID) (string, error) {
	var row struct{ Name string }
	err := n.db.WithContext(ctx).Table("users").Select("name").Where("id = ?", userID).Scan(&row).Error
	return row.Name, err
}

// Config drives Handler construction.
type Config struct {
	// AppBaseURL is used to build Stripe success/cancel/return URLs.
	// Mandatory in production — the SDK does not assume a hostname.
	AppBaseURL string
	// DefaultReturnPath is appended to AppBaseURL when the caller does
	// not pass a return_to. Defaults to "/settings/billing".
	DefaultReturnPath string
	// UserLookup resolves the caller's display name for first checkout.
	UserLookup UserLookup
}

// Handler exposes the billing routes for Fiber v3.
type Handler struct {
	db      *gorm.DB
	billing *billing.Service
	cfg     Config
}

// New constructs a Handler. Pass an AppBaseURL ("https://app.example.com")
// so Stripe knows where to redirect after checkout/portal sessions.
func New(db *gorm.DB, svc *billing.Service, cfg Config) *Handler {
	if cfg.AppBaseURL == "" {
		cfg.AppBaseURL = "http://localhost:5173"
	}
	cfg.AppBaseURL = strings.TrimRight(cfg.AppBaseURL, "/")
	if cfg.DefaultReturnPath == "" {
		cfg.DefaultReturnPath = "/settings/billing"
	}
	if cfg.UserLookup == nil {
		cfg.UserLookup = NewDefaultUserLookup(db)
	}
	return &Handler{db: db, billing: svc, cfg: cfg}
}

// ──────────────────────────────────────────────────────────────────────
// GET /api/billing/subscription
// ──────────────────────────────────────────────────────────────────────

// Subscription returns the caller's current subscription state plus
// enough derived info for the UI (days remaining, trial flag, plan
// limits). Response uses the kernel {success, data} envelope.
func (h *Handler) Subscription(c fiber.Ctx) error {
	orgID, ok := c.Locals("organization_id").(uuid.UUID)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"success": false, "error": "unauthorized"})
	}

	var sub models.Subscription
	if err := h.db.Preload("Plan").
		Where("organization_id = ?", orgID).
		Order("created_at DESC").First(&sub).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "no_subscription"})
	}

	data := fiber.Map{
		"id":                      sub.ID,
		"plan_slug":               sub.Plan.Slug,
		"plan_name":               sub.Plan.Name,
		"status":                  sub.Status,
		"interval":                sub.Interval,
		"current_period_start":    sub.CurrentPeriodStart,
		"current_period_end":      sub.CurrentPeriodEnd,
		"trial_start":             sub.TrialStart,
		"trial_end":               sub.TrialEnd,
		"is_active":               sub.IsActive(),
		"days_remaining":          sub.DaysRemaining(),
		"gateway":                 sub.Gateway,
		"gateway_subscription_id": sub.GatewaySubscriptionID,
		"limits": fiber.Map{
			"max_agents":         sub.Plan.MaxAgents,
			"max_contacts":       sub.Plan.MaxContacts,
			"max_messages_month": sub.Plan.MaxMessagesMonth,
			"max_devices":        sub.Plan.MaxDevices,
			"max_users":          sub.Plan.MaxUsers,
		},
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

// ──────────────────────────────────────────────────────────────────────
// POST /api/billing/checkout-session
// ──────────────────────────────────────────────────────────────────────

// Checkout creates a Stripe Checkout Session for the requested plan and
// returns a redirect URL. Trial enforcement (14 days for Pro) is applied
// inside the billing service.
func (h *Handler) Checkout(c fiber.Ctx) error {
	if !h.billing.IsConfigured() {
		return c.Status(503).JSON(fiber.Map{
			"success": false,
			"error":   "billing_not_configured",
			"message": "Billing is not configured — admin must add Stripe keys in /platform/settings",
		})
	}

	orgID, _ := c.Locals("organization_id").(uuid.UUID)
	email, _ := c.Locals("user_email").(string)
	userID, _ := c.Locals("user_id").(uuid.UUID)

	var req struct {
		PlanSlug string `json:"plan_slug"`
		Interval string `json:"interval"` // monthly | yearly
		ReturnTo string `json:"return_to,omitempty"`
	}
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "invalid_body"})
	}
	if req.Interval != "monthly" && req.Interval != "yearly" {
		req.Interval = "monthly"
	}

	name, _ := h.cfg.UserLookup.NameByID(c.Context(), userID)

	successPath := req.ReturnTo
	if successPath == "" {
		successPath = h.cfg.DefaultReturnPath
	}

	res, err := h.billing.CreateCheckoutSession(c.Context(), billing.CheckoutInput{
		OrgID:      orgID,
		PlanSlug:   req.PlanSlug,
		Interval:   req.Interval,
		OwnerEmail: email,
		OwnerName:  name,
		SuccessURL: h.cfg.AppBaseURL + successPath + "?checkout=success&session_id={CHECKOUT_SESSION_ID}",
		CancelURL:  h.cfg.AppBaseURL + successPath + "?checkout=cancel",
	})
	if err != nil {
		log.Printf("billing: checkout failed: %v", err)
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"url": res.URL, "session_id": res.SessionID},
	})
}

// ──────────────────────────────────────────────────────────────────────
// POST /api/billing/portal-session
// ──────────────────────────────────────────────────────────────────────

// Portal returns a one-time Customer Portal URL.
func (h *Handler) Portal(c fiber.Ctx) error {
	if !h.billing.IsConfigured() {
		return c.Status(503).JSON(fiber.Map{
			"success": false,
			"error":   "billing_not_configured",
		})
	}

	orgID, _ := c.Locals("organization_id").(uuid.UUID)

	var req struct {
		ReturnTo string `json:"return_to,omitempty"`
	}
	_ = c.Bind().Body(&req)
	if req.ReturnTo == "" {
		req.ReturnTo = h.cfg.DefaultReturnPath
	}

	url, err := h.billing.CreatePortalSession(c.Context(), orgID, h.cfg.AppBaseURL+req.ReturnTo)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"url": url},
	})
}

// ──────────────────────────────────────────────────────────────────────
// POST /webhooks/stripe (public)
// ──────────────────────────────────────────────────────────────────────

// Webhook receives events from Stripe and reconciles local subscription
// state. Public route (no auth) — security is the signature verification.
func (h *Handler) Webhook(c fiber.Ctx) error {
	// fiber v3 exposes the body via Body() in test mode (no stream) and
	// via BodyStream() when streaming. Prefer Body() and fall back to
	// the stream when empty for very large payloads.
	payload := c.Body()
	if len(payload) == 0 {
		if stream := c.Request().BodyStream(); stream != nil {
			if data, err := io.ReadAll(stream); err == nil {
				payload = data
			}
		}
	}

	sigHeader := c.Get("Stripe-Signature")
	evt, err := h.billing.VerifyWebhook(payload, sigHeader)
	if err != nil {
		log.Printf("stripe webhook: verify failed: %v", err)
		// Status 400 with a plain string body — Stripe surfaces this in
		// the dashboard; an envelope is unnecessary noise.
		return c.Status(400).SendString("invalid signature")
	}

	rawData := []byte("{}")
	if evt.Data != nil {
		rawData = evt.Data.Raw
	}

	switch evt.Type {
	case "checkout.session.completed":
		var data struct {
			Subscription string `json:"subscription"`
		}
		_ = json.Unmarshal(rawData, &data)
		if data.Subscription != "" {
			if err := h.billing.SyncSubscriptionFromStripe(c.Context(), data.Subscription); err != nil {
				log.Printf("stripe webhook: sync after checkout: %v", err)
			}
		}

	case "customer.subscription.created",
		"customer.subscription.updated",
		"customer.subscription.deleted",
		"customer.subscription.trial_will_end":
		var sub struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(rawData, &sub)
		if sub.ID != "" {
			if err := h.billing.SyncSubscriptionFromStripe(c.Context(), sub.ID); err != nil {
				log.Printf("stripe webhook: sync sub %s: %v", sub.ID, err)
			}
		}

	case "invoice.payment_succeeded", "invoice.payment_failed":
		var inv struct {
			Subscription string `json:"subscription"`
		}
		_ = json.Unmarshal(rawData, &inv)
		if inv.Subscription != "" {
			if err := h.billing.SyncSubscriptionFromStripe(c.Context(), inv.Subscription); err != nil {
				log.Printf("stripe webhook: sync after invoice: %v", err)
			}
		}

	default:
		// Acknowledged but no-op.
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"received": true, "type": evt.Type, "at": time.Now().UTC()},
	})
}

// RunTrialExpirationSweep flips trialing subscriptions whose trial_end
// has elapsed to past_due. Mount on a daily scheduler.
func RunTrialExpirationSweep(db *gorm.DB) {
	now := time.Now()
	res := db.Model(&models.Subscription{}).
		Where("status = ? AND trial_end IS NOT NULL AND trial_end < ?", "trialing", now).
		Updates(map[string]any{
			"status":     "past_due",
			"ended_at":   now,
			"updated_at": now,
		})
	if res.Error != nil {
		log.Printf("billing: trial sweep error: %v", res.Error)
		return
	}
	if res.RowsAffected > 0 {
		log.Printf("billing: trial sweep marked %d subscription(s) past_due", res.RowsAffected)
	}
}

// Compile-time assertion to keep the billing import alive even if some
// of the handlers are pruned in the future.
var _ = errors.New
