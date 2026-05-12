package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/asteby/metacore-sdk/billing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

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

// TestWebhook_BadSignature exercises the public webhook route end-to-end:
// when the Stripe-Signature header is bogus, the handler must return 400
// and a plain-text body (no envelope) so Stripe's dashboard surfaces it.
func TestWebhook_BadSignature(t *testing.T) {
	db := newTestDB(t)
	if err := db.Exec(`INSERT INTO platform_configs (id, stripe_secret_key, stripe_webhook_key)
		VALUES (?, ?, ?)`, uuid.New().String(), "sk_test_fake", "whsec_test_fake").Error; err != nil {
		t.Fatalf("seed config: %v", err)
	}
	svc := billing.New(db)
	h := New(db, svc, Config{AppBaseURL: "https://app.example.com"})

	app := fiber.New()
	app.Post("/webhooks/stripe", h.Webhook)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/stripe", bytes.NewBufferString(`{"id":"evt_fake"}`))
	req.Header.Set("Stripe-Signature", "t=1,v1=deadbeef")
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Test: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for bad signature, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "invalid signature" {
		t.Fatalf("expected plain body 'invalid signature', got %q", string(body))
	}
}

// TestSubscription_Unauthorized hits the protected endpoint without an
// organization_id in the request locals — handler must respond 401 with
// the kernel envelope.
func TestSubscription_Unauthorized(t *testing.T) {
	db := newTestDB(t)
	svc := billing.New(db)
	h := New(db, svc, Config{AppBaseURL: "https://app.example.com"})

	app := fiber.New()
	app.Get("/billing/subscription", h.Subscription)

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/billing/subscription", nil))
	if err != nil {
		t.Fatalf("Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 without org, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["success"] != false {
		t.Fatalf("expected success=false, got %v", body["success"])
	}
}

// TestCheckout_NotConfigured verifies the 503 path when no Stripe keys
// are loaded. The body should advertise the configured failure mode
// rather than crashing.
func TestCheckout_NotConfigured(t *testing.T) {
	db := newTestDB(t)
	svc := billing.New(db) // no keys
	if svc.IsConfigured() {
		t.Fatalf("precondition: service should start unconfigured")
	}
	h := New(db, svc, Config{AppBaseURL: "https://app.example.com"})

	app := fiber.New()
	app.Post("/billing/checkout-session", func(c fiber.Ctx) error {
		c.Locals("organization_id", uuid.New())
		return h.Checkout(c)
	})

	body := bytes.NewBufferString(`{"plan_slug":"pro","interval":"monthly"}`)
	req := httptest.NewRequest(http.MethodPost, "/billing/checkout-session", body)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Test: %v", err)
	}
	if resp.StatusCode != 503 {
		t.Fatalf("expected 503 when not configured, got %d", resp.StatusCode)
	}
	var parsed map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&parsed)
	if parsed["success"] != false {
		t.Fatalf("expected success=false, got %v", parsed["success"])
	}
}
