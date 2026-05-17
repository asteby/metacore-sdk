// Package billing wraps the Stripe gateway for subscription management.
//
// Lifecycle: the Service is constructed at boot and is intentionally usable
// even when no Stripe API key has been configured (IsConfigured() == false).
// In that "no-op" state, all methods that would mutate Stripe return
// ErrNotConfigured, while read paths (subscription state in DB, quota
// counters) keep working — so the rest of the platform doesn't break when
// the admin hasn't pasted keys yet.
//
// All Stripe credentials live in PlatformConfig (DB-backed) so superadmins
// can rotate them from the admin UI without redeploying. The Service
// caches the active key in memory; call Reload() after the admin updates
// the platform config to pick up new keys without a restart.
//
// Host integration. The SDK is host-agnostic by design:
//
//   - Organization lookups go through the OrganizationStore interface; hosts
//     implement a tiny adapter on top of their own Organization model. A
//     default GORM-backed implementation (NewGormOrganizationStore) is
//     provided for the common case where the host table is named
//     "organizations" with columns id, name and stripe_customer_id.
//   - Platform defaults (platform name, support URL, branding colours) are
//     injected via WithPlatformDefaults so the SDK never hardcodes a
//     consumer brand.
//   - The handler and middleware sub-packages adapt the framework-agnostic
//     Service to Fiber v3, following kernel Law 3 (transport adapter is
//     thin; business logic lives on the service).
package billing

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/google/uuid"
	stripe "github.com/stripe/stripe-go/v85"
	webhook "github.com/stripe/stripe-go/v85/webhook"
	"gorm.io/gorm"
)

// ErrNotConfigured is returned by mutating methods when no Stripe key is set.
var ErrNotConfigured = errors.New("billing: stripe is not configured")

// ErrInvalidWebhook is returned when webhook signature verification fails.
var ErrInvalidWebhook = errors.New("billing: invalid webhook signature")

// TrialDays is the trial length applied automatically to the Pro plan.
const TrialDays = 14

// Organization is the minimal shape billing needs from the host's tenant
// row: an identity, a display name (used as the Stripe customer name) and
// a writable Stripe customer ID slot.
//
// Hosts implement OrganizationStore on top of their own model.
type Organization struct {
	ID               uuid.UUID
	Name             string
	StripeCustomerID string
}

// OrganizationStore decouples the billing service from the host's tenant
// model so the SDK does not need to import every consumer's Organization
// type. Implementations are typically a 10-line GORM adapter.
type OrganizationStore interface {
	// Get returns the org with the given id, or an error if not found.
	Get(ctx context.Context, id uuid.UUID) (*Organization, error)
	// SetStripeCustomerID persists the customer id back on the org row.
	SetStripeCustomerID(ctx context.Context, id uuid.UUID, customerID string) error
}

// Option configures Service at construction time.
type Option func(*Service)

// WithPlatformDefaults seeds the platform_configs row when the table is
// empty (first boot). After the row exists, callers must edit it via the
// admin UI — defaults are not re-applied.
func WithPlatformDefaults(d models.PlatformConfigDefaults) Option {
	return func(s *Service) { s.defaults = d }
}

// WithOrganizationStore registers the host adapter that maps the SDK's
// Organization interface onto the host's tenant model. Without an
// explicit store, the Service falls back to NewGormOrganizationStore which
// assumes the standard "organizations" table layout.
func WithOrganizationStore(store OrganizationStore) Option {
	return func(s *Service) { s.orgs = store }
}

// Service is the public billing facade.
type Service struct {
	db       *gorm.DB
	orgs     OrganizationStore
	defaults models.PlatformConfigDefaults

	mu            sync.RWMutex
	secretKey     string
	webhookSecret string
	client        *stripe.Client // nil when not configured
}

// New constructs a Service and loads keys from PlatformConfig. Failing to
// load is non-fatal: the service starts in unconfigured state. Pass
// WithPlatformDefaults and WithOrganizationStore to wire host-specific
// branding and tenant lookups.
func New(db *gorm.DB, opts ...Option) *Service {
	s := &Service{db: db}
	for _, opt := range opts {
		opt(s)
	}
	if s.orgs == nil {
		s.orgs = NewGormOrganizationStore(db)
	}
	_ = s.Reload(context.Background())
	return s
}

// Reload re-reads Stripe keys from the platform_configs table. Safe to
// call at runtime after the admin updates keys via the platform settings
// admin UI.
func (s *Service) Reload(_ context.Context) error {
	var cfg models.PlatformConfig
	if err := s.db.First(&cfg).Error; err != nil {
		// First boot: no config row yet — stay unconfigured silently.
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.secretKey = strings.TrimSpace(cfg.StripeSecretKey)
	s.webhookSecret = strings.TrimSpace(cfg.StripeWebhookKey)

	if s.secretKey == "" {
		s.client = nil
		return nil
	}

	s.client = stripe.NewClient(s.secretKey)
	return nil
}

// Configure overrides the in-memory Stripe keys without touching the
// platform_configs row. Useful for tests and short-lived workers; in
// production prefer Reload after the admin writes the keys to the DB.
func (s *Service) Configure(secretKey, webhookSecret string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.secretKey = strings.TrimSpace(secretKey)
	s.webhookSecret = strings.TrimSpace(webhookSecret)
	if s.secretKey == "" {
		s.client = nil
		return
	}
	s.client = stripe.NewClient(s.secretKey)
}

// IsConfigured returns true when a Stripe secret key is loaded.
func (s *Service) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.client != nil
}

// Defaults returns the platform defaults injected via WithPlatformDefaults.
// Exposed for handlers that want to seed the platform_configs row on first
// admin visit.
func (s *Service) Defaults() models.PlatformConfigDefaults {
	return s.defaults
}

func (s *Service) clientOrErr() (*stripe.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.client == nil {
		return nil, ErrNotConfigured
	}
	return s.client, nil
}

// ──────────────────────────────────────────────────────────────────────
// Customer
// ──────────────────────────────────────────────────────────────────────

// EnsureCustomer creates a Stripe Customer for the given organization if
// it doesn't already have one, and persists the resulting customer ID via
// the OrganizationStore. Returns the (possibly pre-existing) customer ID.
//
// Safe to call when Stripe is not configured: returns ErrNotConfigured.
func (s *Service) EnsureCustomer(ctx context.Context, org *Organization, ownerEmail, ownerName string) (string, error) {
	if org.StripeCustomerID != "" {
		return org.StripeCustomerID, nil
	}

	client, err := s.clientOrErr()
	if err != nil {
		return "", err
	}

	params := &stripe.CustomerCreateParams{
		Email: stripe.String(ownerEmail),
		Name:  stripe.String(strings.TrimSpace(coalesce(org.Name, ownerName))),
		Metadata: map[string]string{
			"organization_id": org.ID.String(),
		},
	}

	cust, err := client.V1Customers.Create(ctx, params)
	if err != nil {
		return "", fmt.Errorf("billing: create customer: %w", err)
	}

	if err := s.orgs.SetStripeCustomerID(ctx, org.ID, cust.ID); err != nil {
		return cust.ID, fmt.Errorf("billing: persist customer id: %w", err)
	}
	org.StripeCustomerID = cust.ID
	return cust.ID, nil
}

// ──────────────────────────────────────────────────────────────────────
// Checkout
// ──────────────────────────────────────────────────────────────────────

// CheckoutInput drives Stripe Checkout Session creation.
type CheckoutInput struct {
	OrgID      uuid.UUID
	PlanSlug   string // e.g. "pro"
	Interval   string // "monthly" or "yearly"
	OwnerEmail string
	OwnerName  string
	SuccessURL string
	CancelURL  string
}

// CheckoutResult is the consumer-facing redirect URL.
type CheckoutResult struct {
	URL       string
	SessionID string
}

// CreateCheckoutSession creates a Stripe Checkout Session in subscription
// mode for the requested plan. The session embeds a 14-day trial for the
// Pro plan; other paid plans can override via params if added later.
func (s *Service) CreateCheckoutSession(ctx context.Context, in CheckoutInput) (*CheckoutResult, error) {
	client, err := s.clientOrErr()
	if err != nil {
		return nil, err
	}

	plan, err := s.findPlanBySlug(in.PlanSlug)
	if err != nil {
		return nil, err
	}

	// Enterprise (and any plan without Stripe prices) is sales-led —
	// checkout is not the right surface; callers should redirect to a
	// contact form.
	priceID := plan.StripePriceMonthlyID
	if in.Interval == "yearly" {
		priceID = plan.StripePriceYearlyID
	}
	if priceID == "" {
		return nil, fmt.Errorf("billing: plan %q has no Stripe price for interval %q (run sync first)", plan.Slug, in.Interval)
	}

	org, err := s.orgs.Get(ctx, in.OrgID)
	if err != nil {
		return nil, fmt.Errorf("billing: load org: %w", err)
	}

	customerID, err := s.EnsureCustomer(ctx, org, in.OwnerEmail, in.OwnerName)
	if err != nil {
		return nil, err
	}

	params := &stripe.CheckoutSessionCreateParams{
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		Customer: stripe.String(customerID),
		LineItems: []*stripe.CheckoutSessionCreateLineItemParams{
			{Price: stripe.String(priceID), Quantity: stripe.Int64(1)},
		},
		SuccessURL:        stripe.String(in.SuccessURL),
		CancelURL:         stripe.String(in.CancelURL),
		ClientReferenceID: stripe.String(in.OrgID.String()),
		Metadata: map[string]string{
			"organization_id": in.OrgID.String(),
			"plan_slug":       plan.Slug,
			"interval":        in.Interval,
		},
		SubscriptionData: &stripe.CheckoutSessionCreateSubscriptionDataParams{
			Metadata: map[string]string{
				"organization_id": in.OrgID.String(),
				"plan_slug":       plan.Slug,
			},
		},
	}

	// Every paid plan (PricingKind == "paid") gets the 14-day trial in
	// checkout. Quote-only plans never reach Stripe checkout. Trial set via
	// SubscriptionData so it survives webhook reconciliation cleanly.
	if plan.PricingKind == "paid" {
		params.SubscriptionData.TrialPeriodDays = stripe.Int64(int64(TrialDays))
	}

	sess, err := client.V1CheckoutSessions.Create(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("billing: create checkout session: %w", err)
	}

	return &CheckoutResult{URL: sess.URL, SessionID: sess.ID}, nil
}

// ──────────────────────────────────────────────────────────────────────
// Customer Portal
// ──────────────────────────────────────────────────────────────────────

// CreatePortalSession returns a one-time URL for the Stripe Customer Portal
// where the customer can update payment method, see invoices, or cancel.
func (s *Service) CreatePortalSession(ctx context.Context, orgID uuid.UUID, returnURL string) (string, error) {
	client, err := s.clientOrErr()
	if err != nil {
		return "", err
	}

	org, err := s.orgs.Get(ctx, orgID)
	if err != nil {
		return "", fmt.Errorf("billing: load org: %w", err)
	}
	if org.StripeCustomerID == "" {
		return "", errors.New("billing: organization has no Stripe customer yet")
	}

	params := &stripe.BillingPortalSessionCreateParams{
		Customer:  stripe.String(org.StripeCustomerID),
		ReturnURL: stripe.String(returnURL),
	}

	sess, err := client.V1BillingPortalSessions.Create(ctx, params)
	if err != nil {
		return "", fmt.Errorf("billing: create portal session: %w", err)
	}
	return sess.URL, nil
}

// ──────────────────────────────────────────────────────────────────────
// Webhooks
// ──────────────────────────────────────────────────────────────────────

// VerifyWebhook constructs and verifies a Stripe Event from a raw payload
// and signature header. Uses the active webhook secret loaded from config.
func (s *Service) VerifyWebhook(payload []byte, signatureHeader string) (stripe.Event, error) {
	s.mu.RLock()
	secret := s.webhookSecret
	s.mu.RUnlock()
	if secret == "" {
		return stripe.Event{}, ErrNotConfigured
	}
	evt, err := webhook.ConstructEvent(payload, signatureHeader, secret)
	if err != nil {
		return stripe.Event{}, fmt.Errorf("%w: %v", ErrInvalidWebhook, err)
	}
	return evt, nil
}

// ──────────────────────────────────────────────────────────────────────
// Subscriptions: pull-based sync
// ──────────────────────────────────────────────────────────────────────

// SyncSubscriptionFromStripe reconciles the local subscriptions row with
// the authoritative state of a Stripe subscription. Called from webhook
// handlers and from polling/recovery flows.
func (s *Service) SyncSubscriptionFromStripe(ctx context.Context, stripeSubID string) error {
	client, err := s.clientOrErr()
	if err != nil {
		return err
	}

	sub, err := client.V1Subscriptions.Retrieve(ctx, stripeSubID, nil)
	if err != nil {
		return fmt.Errorf("billing: retrieve subscription: %w", err)
	}

	return s.applyStripeSubscription(sub)
}

func (s *Service) applyStripeSubscription(sub *stripe.Subscription) error {
	orgIDStr := sub.Metadata["organization_id"]
	planSlug := sub.Metadata["plan_slug"]

	if orgIDStr == "" {
		return fmt.Errorf("billing: subscription %q missing organization_id metadata", sub.ID)
	}
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		return fmt.Errorf("billing: invalid organization_id metadata: %w", err)
	}

	// Resolve the local plan. Fallback: derive from price ID if metadata
	// is empty.
	var plan models.Plan
	if planSlug != "" {
		_ = s.db.Where("slug = ?", planSlug).First(&plan).Error
	}
	if plan.ID == uuid.Nil && len(sub.Items.Data) > 0 {
		stripePriceID := sub.Items.Data[0].Price.ID
		s.db.Where("stripe_price_monthly_id = ? OR stripe_price_yearly_id = ?", stripePriceID, stripePriceID).First(&plan)
	}
	if plan.ID == uuid.Nil {
		return fmt.Errorf("billing: cannot resolve plan for stripe sub %q", sub.ID)
	}

	interval := "monthly"
	if len(sub.Items.Data) > 0 && sub.Items.Data[0].Price.Recurring != nil {
		if sub.Items.Data[0].Price.Recurring.Interval == "year" {
			interval = "yearly"
		}
	}

	periodStart, periodEnd := subscriptionPeriod(sub)
	var trialStart, trialEnd, canceledAt, endedAt *time.Time
	if sub.TrialStart > 0 {
		t := time.Unix(sub.TrialStart, 0)
		trialStart = &t
	}
	if sub.TrialEnd > 0 {
		t := time.Unix(sub.TrialEnd, 0)
		trialEnd = &t
	}
	if sub.CanceledAt > 0 {
		t := time.Unix(sub.CanceledAt, 0)
		canceledAt = &t
	}
	if sub.EndedAt > 0 {
		t := time.Unix(sub.EndedAt, 0)
		endedAt = &t
	}

	// Upsert by stripe subscription ID.
	var existing models.Subscription
	err = s.db.Where("gateway_subscription_id = ?", sub.ID).First(&existing).Error

	values := models.Subscription{
		OrganizationID:        orgID,
		PlanID:                plan.ID,
		Interval:              interval,
		Status:                string(sub.Status),
		CurrentPeriodStart:    periodStart,
		CurrentPeriodEnd:      periodEnd,
		TrialStart:            trialStart,
		TrialEnd:              trialEnd,
		CanceledAt:            canceledAt,
		EndedAt:               endedAt,
		Gateway:               "stripe",
		GatewaySubscriptionID: sub.ID,
		GatewayCustomerID:     sub.Customer.ID,
	}
	if sub.DefaultPaymentMethod != nil {
		values.GatewayPaymentMethodID = sub.DefaultPaymentMethod.ID
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.db.Create(&values).Error
	}
	if err != nil {
		return err
	}

	values.ID = existing.ID
	return s.db.Save(&values).Error
}

func subscriptionPeriod(sub *stripe.Subscription) (time.Time, time.Time) {
	// stripe-go v85 exposes period fields on each subscription item rather
	// than the subscription itself; pick the longest-running item to be
	// safe.
	var start, end int64
	for _, it := range sub.Items.Data {
		if it.CurrentPeriodStart > 0 && (start == 0 || it.CurrentPeriodStart < start) {
			start = it.CurrentPeriodStart
		}
		if it.CurrentPeriodEnd > end {
			end = it.CurrentPeriodEnd
		}
	}
	if start == 0 {
		start = time.Now().Unix()
	}
	if end == 0 {
		// Fall back to one billing period from start so we never persist a
		// zero-value time.Time (which gorm interprets as `0001-01-01`).
		end = start + int64(30*24*time.Hour/time.Second)
	}
	return time.Unix(start, 0), time.Unix(end, 0)
}

// ──────────────────────────────────────────────────────────────────────
// Plan ↔ Stripe product/price sync (admin op)
// ──────────────────────────────────────────────────────────────────────

// SyncPlansToStripe creates Stripe Products + monthly/yearly Prices for
// every active plan with a non-zero price, and persists their IDs.
// Idempotent when called repeatedly: re-uses existing IDs if already
// present in the DB.
//
// Plans with PriceMonthly == 0 (Starter, Enterprise) are skipped — they
// don't participate in checkout.
func (s *Service) SyncPlansToStripe(ctx context.Context) ([]string, error) {
	client, err := s.clientOrErr()
	if err != nil {
		return nil, err
	}

	var plans []models.Plan
	if err := s.db.Where("is_active = ?", true).Order("sort_order ASC").Find(&plans).Error; err != nil {
		return nil, err
	}

	var report []string
	for i := range plans {
		p := &plans[i]
		if p.PriceMonthly == 0 {
			report = append(report, fmt.Sprintf("skip %s (no price)", p.Slug))
			continue
		}

		// Create monthly price if missing.
		if p.StripePriceMonthlyID == "" {
			prod, err := client.V1Products.Create(ctx, &stripe.ProductCreateParams{
				Name:        stripe.String(p.Name),
				Description: stripe.String(p.Description),
				Metadata: map[string]string{
					"plan_slug": p.Slug,
				},
			})
			if err != nil {
				return report, fmt.Errorf("create product %q: %w", p.Slug, err)
			}
			pr, err := client.V1Prices.Create(ctx, &stripe.PriceCreateParams{
				Product:    stripe.String(prod.ID),
				UnitAmount: stripe.Int64(int64(p.PriceMonthly)),
				Currency:   stripe.String(strings.ToLower(p.Currency)),
				Recurring: &stripe.PriceCreateRecurringParams{
					Interval: stripe.String(string(stripe.PriceRecurringIntervalMonth)),
				},
				Metadata: map[string]string{"plan_slug": p.Slug, "interval": "monthly"},
			})
			if err != nil {
				return report, fmt.Errorf("create monthly price %q: %w", p.Slug, err)
			}
			p.StripePriceMonthlyID = pr.ID
			report = append(report, fmt.Sprintf("created %s monthly price %s", p.Slug, pr.ID))
		}

		// Create yearly price if missing and price set.
		if p.StripePriceYearlyID == "" && p.PriceYearly > 0 {
			prodID, err := s.ensureProductForPlan(ctx, client, p)
			if err != nil {
				return report, err
			}
			pr, err := client.V1Prices.Create(ctx, &stripe.PriceCreateParams{
				Product:    stripe.String(prodID),
				UnitAmount: stripe.Int64(int64(p.PriceYearly)),
				Currency:   stripe.String(strings.ToLower(p.Currency)),
				Recurring: &stripe.PriceCreateRecurringParams{
					Interval: stripe.String(string(stripe.PriceRecurringIntervalYear)),
				},
				Metadata: map[string]string{"plan_slug": p.Slug, "interval": "yearly"},
			})
			if err != nil {
				return report, fmt.Errorf("create yearly price %q: %w", p.Slug, err)
			}
			p.StripePriceYearlyID = pr.ID
			report = append(report, fmt.Sprintf("created %s yearly price %s", p.Slug, pr.ID))
		}

		if err := s.db.Save(p).Error; err != nil {
			return report, err
		}
	}
	return report, nil
}

// ensureProductForPlan looks up the product backing this plan's monthly
// price (created earlier in this run) so the yearly price can be attached
// to the same product.
func (s *Service) ensureProductForPlan(ctx context.Context, client *stripe.Client, p *models.Plan) (string, error) {
	if p.StripePriceMonthlyID != "" {
		pr, err := client.V1Prices.Retrieve(ctx, p.StripePriceMonthlyID, nil)
		if err == nil && pr.Product != nil {
			return pr.Product.ID, nil
		}
	}
	prod, err := client.V1Products.Create(ctx, &stripe.ProductCreateParams{
		Name:     stripe.String(p.Name),
		Metadata: map[string]string{"plan_slug": p.Slug},
	})
	if err != nil {
		return "", err
	}
	return prod.ID, nil
}

// ──────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────

func (s *Service) findPlanBySlug(slug string) (*models.Plan, error) {
	var p models.Plan
	if err := s.db.Where("slug = ? AND is_active = ?", slug, true).First(&p).Error; err != nil {
		return nil, fmt.Errorf("billing: plan %q not found", slug)
	}
	return &p, nil
}

func coalesce(parts ...string) string {
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			return p
		}
	}
	return ""
}

// ──────────────────────────────────────────────────────────────────────
// Default GORM-backed OrganizationStore
// ──────────────────────────────────────────────────────────────────────

// gormOrgStore is the default OrganizationStore. It assumes the host's
// table is named "organizations" with at minimum: id (uuid), name (text)
// and stripe_customer_id (text). Hosts whose schema differs should write
// their own adapter and pass WithOrganizationStore.
type gormOrgStore struct {
	db *gorm.DB
}

// NewGormOrganizationStore returns the default OrganizationStore that
// expects an "organizations" table with id / name / stripe_customer_id.
func NewGormOrganizationStore(db *gorm.DB) OrganizationStore {
	return &gormOrgStore{db: db}
}

func (g *gormOrgStore) Get(ctx context.Context, id uuid.UUID) (*Organization, error) {
	var row struct {
		ID               uuid.UUID
		Name             string
		StripeCustomerID string
	}
	err := g.db.WithContext(ctx).
		Table("organizations").
		Select("id, name, stripe_customer_id").
		Where("id = ?", id).
		Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == uuid.Nil {
		return nil, gorm.ErrRecordNotFound
	}
	return &Organization{ID: row.ID, Name: row.Name, StripeCustomerID: row.StripeCustomerID}, nil
}

func (g *gormOrgStore) SetStripeCustomerID(ctx context.Context, id uuid.UUID, customerID string) error {
	return g.db.WithContext(ctx).
		Table("organizations").
		Where("id = ?", id).
		Update("stripe_customer_id", customerID).Error
}
