package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PlatformConfigDefaults seeds the default values applied to the singleton
// platform_configs row when the host first boots. Hosts pass this struct
// to billing.New via the WithPlatformDefaults option so the platform name,
// support email, branding colours, etc. reflect the consumer product — no
// hardcoded "Ops" / "Link" / "Asteby" anywhere in the SDK.
type PlatformConfigDefaults struct {
	PlatformName    string
	PrimaryColor    string
	AccentColor     string
	SupportEmail    string
	SupportURL      string
	DefaultCurrency string
	DefaultTimezone string
	DefaultLanguage string
}

// PlatformConfig is the singleton (single-row) global platform settings
// table. Stripe keys live here so superadmins can rotate them from the
// admin UI without redeploying. Only superadmins should be allowed to read
// or write the table — the host is responsible for enforcing that ACL.
type PlatformConfig struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
	CreatedByID *uuid.UUID     `json:"created_by_id,omitempty" gorm:"type:uuid;index"`

	// Branding.
	PlatformName string `json:"platform_name" gorm:"size:255"`
	PlatformLogo string `json:"platform_logo" gorm:"size:500"`
	PrimaryColor string `json:"primary_color" gorm:"size:20"`
	AccentColor  string `json:"accent_color" gorm:"size:20"`
	FaviconURL   string `json:"favicon_url" gorm:"size:500"`
	SupportEmail string `json:"support_email" gorm:"size:255"`
	SupportURL   string `json:"support_url" gorm:"size:500"`

	// API / external services.
	StripeSecretKey    string `json:"stripe_secret_key" gorm:"size:500"`
	StripeWebhookKey   string `json:"stripe_webhook_key" gorm:"size:500"`
	MetaAppID          string `json:"meta_app_id" gorm:"size:255"`
	MetaAppSecret      string `json:"meta_app_secret" gorm:"size:500"`
	MetaVerifyToken    string `json:"meta_verify_token" gorm:"size:255"`
	WhatsAppServiceURL string `json:"whatsapp_service_url" gorm:"size:500"`

	// Defaults.
	DefaultCurrency string `json:"default_currency" gorm:"size:3"`
	DefaultTimezone string `json:"default_timezone" gorm:"size:100"`
	DefaultLanguage string `json:"default_language" gorm:"size:5"`
}

// TableName lets hosts override the GORM table name without subclassing.
func (PlatformConfig) TableName() string { return "platform_configs" }

// BeforeCreate fills the primary key when absent.
func (c *PlatformConfig) BeforeCreate(_ *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
