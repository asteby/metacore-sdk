// Package middleware exposes the billing guards: subscription-status
// enforcement, plan-tier gating, and per-month quota enforcement.
//
// Two layers — kernel Law 3:
//
//   - Guard is the framework-agnostic business logic. It runs against the
//     database, returns a Decision describing what to do, and never
//     references any web framework.
//   - The FiberMiddleware in this package wraps Guard with a thin adapter
//     that maps Decision → fiber.Ctx response. Apps on another framework
//     can write their own equally thin adapter and reuse Guard.
package middleware

import (
	"context"
	"errors"
	"strings"

	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ──────────────────────────────────────────────────────────────────────
// Framework-agnostic guard
// ──────────────────────────────────────────────────────────────────────

// Decision is the outcome of a guard check. Allowed == true means the
// request can proceed; otherwise StatusCode and Reason carry enough info
// for the transport adapter to build a JSON error body.
type Decision struct {
	Allowed    bool
	StatusCode int
	Reason     string         // machine-readable: "subscription_inactive", "plan_upgrade_required", "quota_exceeded"
	Message    string         // human-readable
	Extra      map[string]any // additional payload (current/limit, required_plan, …)
}

// Guard centralises plan / quota / subscription-status checks. Construct
// once and reuse on a per-route basis.
//
// The guard caches nothing: each call hits the DB. Subscription state is
// cheap (single row, indexed) and the freshness matters more than the QPS
// — we don't want to serve a paying customer after their card declined
// just because we cached their old "active" status for 5 minutes.
type Guard struct {
	db *gorm.DB
}

// NewGuard returns a framework-agnostic billing guard backed by the host
// DB. Errors are surfaced via Decision values, never panics.
func NewGuard(db *gorm.DB) *Guard {
	return &Guard{db: db}
}

// loadSubscription returns the org's most recent subscription row + its
// plan, or nil if none exists (a freshly-created Starter org may not have
// one yet).
func (g *Guard) loadSubscription(orgID uuid.UUID) (*models.Subscription, *models.Plan) {
	var sub models.Subscription
	if err := g.db.Preload("Plan").
		Where("organization_id = ?", orgID).
		Order("created_at DESC").
		First(&sub).Error; err != nil {
		return nil, nil
	}
	return &sub, &sub.Plan
}

// CheckActiveSubscription returns a Decision flagging terminal subscription
// states (past_due, unpaid, canceled). Trialing and active both pass; no
// subscription row at all is permissive (so freshly-registered orgs can
// reach the billing UI to choose a plan).
func (g *Guard) CheckActiveSubscription(_ context.Context, orgID uuid.UUID) Decision {
	sub, _ := g.loadSubscription(orgID)
	if sub == nil {
		return Decision{Allowed: true}
	}
	switch sub.Status {
	case "past_due", "unpaid", "canceled", "incomplete_expired":
		return Decision{
			Allowed:    false,
			StatusCode: 402,
			Reason:     "subscription_inactive",
			Message:    "Your subscription is no longer active. Please update billing to continue.",
			Extra: map[string]any{
				"subscription_status": sub.Status,
				"plan_slug":           sub.Plan.Slug,
			},
		}
	}
	return Decision{Allowed: true}
}

// CheckPlan returns a Decision that 403s callers whose current plan tier
// is below minSlug. Tier order: starter < pro < enterprise.
func (g *Guard) CheckPlan(_ context.Context, orgID uuid.UUID, minSlug string) Decision {
	min := PlanRank(minSlug)
	_, plan := g.loadSubscription(orgID)
	if plan == nil || PlanRank(plan.Slug) < min {
		currentSlug := "none"
		if plan != nil {
			currentSlug = plan.Slug
		}
		return Decision{
			Allowed:    false,
			StatusCode: 403,
			Reason:     "plan_upgrade_required",
			Message:    "This feature requires the " + strings.Title(minSlug) + " plan.",
			Extra: map[string]any{
				"required_plan": minSlug,
				"current_plan":  currentSlug,
			},
		}
	}
	return Decision{Allowed: true}
}

// PlanLimitField projects a per-plan limit out of a Plan. The function
// shape exists so callers can express different metrics (MaxAgents,
// MaxMessagesMonth, …) without the guard knowing about specific fields.
type PlanLimitField func(*models.Plan) int

// CheckQuota returns a Decision that 429s callers who have hit a per-month
// limit for a given metric. -1 in the plan means unlimited. The caller is
// responsible for incrementing the counter via billing.IncrementMetric
// after the action succeeds.
func (g *Guard) CheckQuota(_ context.Context, orgID uuid.UUID, metric string, planLimit PlanLimitField) Decision {
	_, plan := g.loadSubscription(orgID)
	if plan == nil {
		return Decision{Allowed: true}
	}
	limit := planLimit(plan)
	if limit < 0 {
		return Decision{Allowed: true}
	}

	current := getMonthlyMetric(g.db, orgID, metric)
	if current >= limit {
		return Decision{
			Allowed:    false,
			StatusCode: 429,
			Reason:     "quota_exceeded",
			Message:    "You've hit your plan limit for this billing cycle.",
			Extra: map[string]any{
				"metric":     metric,
				"current":    current,
				"limit":      limit,
				"plan_slug":  plan.Slug,
				"upgrade_to": "pro",
			},
		}
	}
	return Decision{Allowed: true}
}

// PlanRank establishes ordering for plan checks. Unknown slugs rank 0.
func PlanRank(slug string) int {
	switch slug {
	case "starter":
		return 1
	case "pro":
		return 2
	case "enterprise":
		return 3
	default:
		return 0
	}
}

func getMonthlyMetric(db *gorm.DB, orgID uuid.UUID, metric string) int {
	var um models.UsageMetric
	err := db.Where("organization_id = ? AND metric = ? AND period_start = ?", orgID, metric, models.CurrentMonthStart()).
		First(&um).Error
	if err != nil {
		return 0
	}
	return um.Count
}

// ──────────────────────────────────────────────────────────────────────
// Fiber v3 adapter (thin)
// ──────────────────────────────────────────────────────────────────────

// FiberMiddleware wraps Guard with Fiber-specific concerns: extracting
// orgID from c.Locals and emitting JSON responses with the kernel
// {success, data, meta} envelope. Apps on other frameworks should write
// an equivalent adapter that consumes Guard.
type FiberMiddleware struct {
	g *Guard
}

// NewFiberMiddleware wraps the given Guard for Fiber v3 mounting.
func NewFiberMiddleware(g *Guard) *FiberMiddleware {
	return &FiberMiddleware{g: g}
}

// ErrUnauthorized signals the standard 401 path when no organization_id is
// present in the request locals. Adapters convert this to the host's
// preferred 401 body.
var ErrUnauthorized = errors.New("billing: unauthorized")

// orgFromLocals extracts the tenant id from a Fiber request, returning
// ErrUnauthorized when missing.
func orgFromLocals(c fiber.Ctx) (uuid.UUID, error) {
	orgID, ok := c.Locals("organization_id").(uuid.UUID)
	if !ok {
		return uuid.UUID{}, ErrUnauthorized
	}
	return orgID, nil
}

// renderDecision converts a Decision to a Fiber response. Allowed
// decisions call c.Next(); rejections emit the kernel envelope.
func renderDecision(c fiber.Ctx, d Decision) error {
	if d.Allowed {
		return c.Next()
	}
	body := fiber.Map{
		"success": false,
		"error":   d.Reason,
		"message": d.Message,
	}
	for k, v := range d.Extra {
		body[k] = v
	}
	return c.Status(d.StatusCode).JSON(body)
}

// ActiveSubscriptionRequired returns 402 when the current org's subscription
// is in a terminal state. Trialing and active both pass.
//
// Mount this on endpoints that should be cut off when the customer stops
// paying — anything that does real work for them. Billing endpoints
// themselves must NOT be guarded so they can recover.
func (m *FiberMiddleware) ActiveSubscriptionRequired(c fiber.Ctx) error {
	orgID, err := orgFromLocals(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"success": false, "error": "unauthorized"})
	}
	return renderDecision(c, m.g.CheckActiveSubscription(c.Context(), orgID))
}

// RequirePlan returns a guard that 403s callers whose current plan tier is
// below minSlug.
func (m *FiberMiddleware) RequirePlan(minSlug string) fiber.Handler {
	return func(c fiber.Ctx) error {
		orgID, err := orgFromLocals(c)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{"success": false, "error": "unauthorized"})
		}
		return renderDecision(c, m.g.CheckPlan(c.Context(), orgID, minSlug))
	}
}

// RequireQuota enforces a per-month count limit for a given metric.
func (m *FiberMiddleware) RequireQuota(metric string, planLimitField PlanLimitField) fiber.Handler {
	return func(c fiber.Ctx) error {
		orgID, err := orgFromLocals(c)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{"success": false, "error": "unauthorized"})
		}
		return renderDecision(c, m.g.CheckQuota(c.Context(), orgID, metric, planLimitField))
	}
}
