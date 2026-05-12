package billing

import (
	"context"
	"errors"
	"testing"

	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// newTestDB spins up an in-memory SQLite database with just the
// platform_configs table that the billing service touches on its
// unconfigured path.
//
// gorm's AutoMigrate emits Postgres-flavoured DDL (gen_random_uuid())
// that sqlite can't parse, so the schema is spelled out by hand.
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.Exec(`CREATE TABLE platform_configs (
		id TEXT PRIMARY KEY,
		created_at DATETIME,
		updated_at DATETIME,
		deleted_at DATETIME,
		platform_name TEXT,
		stripe_secret_key TEXT,
		stripe_webhook_key TEXT
	)`).Error; err != nil {
		t.Fatalf("create platform_configs: %v", err)
	}
	return db
}

// TestService_NotConfigured documents the no-op state: when no
// PlatformConfig row exists, New must succeed and all mutating methods
// must return ErrNotConfigured so the rest of the app keeps working
// without Stripe.
func TestService_NotConfigured(t *testing.T) {
	db := newTestDB(t)
	s := New(db)

	if s.IsConfigured() {
		t.Fatalf("expected unconfigured service, got configured")
	}

	_, err := s.CreateCheckoutSession(context.Background(), CheckoutInput{
		OrgID:    uuid.New(),
		PlanSlug: "pro",
		Interval: "monthly",
	})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured from CreateCheckoutSession, got %v", err)
	}

	if _, err := s.CreatePortalSession(context.Background(), uuid.New(), "https://example.com"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured from CreatePortalSession, got %v", err)
	}

	if _, err := s.VerifyWebhook([]byte(`{}`), "t=1,v1=deadbeef"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured from VerifyWebhook, got %v", err)
	}
}

// TestService_ReloadPicksUpKeys ensures Reload() refreshes credentials
// from PlatformConfig at runtime (admin rotation flow).
func TestService_ReloadPicksUpKeys(t *testing.T) {
	db := newTestDB(t)
	s := New(db)
	if s.IsConfigured() {
		t.Fatalf("precondition: should start unconfigured")
	}

	if err := db.Exec(`INSERT INTO platform_configs
		(id, stripe_secret_key, stripe_webhook_key)
		VALUES (?, ?, ?)`,
		uuid.New().String(), "sk_test_fake", "whsec_test_fake").Error; err != nil {
		t.Fatalf("seed config: %v", err)
	}

	if err := s.Reload(context.Background()); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	if !s.IsConfigured() {
		t.Fatalf("expected configured after Reload with key, got false")
	}
}

// TestService_VerifyWebhookBadSignature exercises the signature path:
// with a webhook secret loaded but a bogus signature header,
// VerifyWebhook must wrap the error in ErrInvalidWebhook so callers can
// return 400 without leaking Stripe internals.
func TestService_VerifyWebhookBadSignature(t *testing.T) {
	db := newTestDB(t)
	if err := db.Exec(`INSERT INTO platform_configs (id, stripe_secret_key, stripe_webhook_key)
		VALUES (?, ?, ?)`, uuid.New().String(), "sk_test_fake", "whsec_test_fake").Error; err != nil {
		t.Fatalf("seed config: %v", err)
	}
	s := New(db)
	if !s.IsConfigured() {
		t.Fatalf("expected configured after seed")
	}

	_, err := s.VerifyWebhook([]byte(`{"id":"evt_fake"}`), "t=1,v1=deadbeef")
	if err == nil {
		t.Fatalf("expected error from bad signature, got nil")
	}
	if !errors.Is(err, ErrInvalidWebhook) {
		t.Fatalf("expected ErrInvalidWebhook, got %v", err)
	}

	// Silence unused-var warning if we ever add fields to the model
	// reference.
	_ = models.Subscription{}
}

// TestService_ConfigureOverridesKeys checks the in-memory Configure
// helper used by tests and short-lived workers.
func TestService_ConfigureOverridesKeys(t *testing.T) {
	db := newTestDB(t)
	s := New(db)
	if s.IsConfigured() {
		t.Fatalf("precondition: should start unconfigured")
	}
	s.Configure("sk_test_inline", "whsec_test_inline")
	if !s.IsConfigured() {
		t.Fatalf("expected configured after Configure call")
	}
	s.Configure("", "")
	if s.IsConfigured() {
		t.Fatalf("expected unconfigured after blank Configure call")
	}
}
