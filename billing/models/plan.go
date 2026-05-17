// Package models holds the persistent shapes used by the billing service:
// Plan, Subscription, UsageMetric and PlatformConfig.
//
// Models are intentionally self-contained — they do not embed any
// host-defined base struct. Hosts that need additional fields (audit
// columns, soft-deletes, organization scoping) should compose, not embed,
// these types in their own table layer or run the SDK as-is and let GORM
// manage the schema.
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Plan is a subscription tier. Slugs are stable contract identifiers
// (starter / pro / enterprise are the SDK defaults but hosts may seed
// any slug they want — middleware tier ordering lives at the host layer).
type Plan struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
	CreatedByID *uuid.UUID     `json:"created_by_id,omitempty" gorm:"type:uuid;index"`

	Name        string `json:"name" gorm:"size:100;not null"`
	Slug        string `json:"slug" gorm:"size:50;not null;uniqueIndex"`
	Description string `json:"description" gorm:"size:500"`

	// Pricing (in cents to avoid float issues).
	PriceMonthly int    `json:"price_monthly" gorm:"not null;default:0"`
	PriceYearly  int    `json:"price_yearly" gorm:"not null;default:0"`
	Currency     string `json:"currency" gorm:"size:3;not null;default:'USD'"`

	// PricingKind separates how a plan is sold from how much it costs:
	//
	//   - "free":  zero-cost recurring plan (no Stripe checkout, no trial)
	//   - "paid":  recurring Stripe subscription (eligible for the trial)
	//   - "quote": sales-led / contact-us (never reaches Stripe)
	//
	// Defaults to "paid" so existing rows with a non-zero price keep working
	// without a backfill. Hosts that seed free or quote tiers must set this
	// explicitly. The Stripe trial gate in CreateCheckoutSession reads this.
	PricingKind string `json:"pricing_kind" gorm:"size:16;not null;default:'paid'"`

	// Limits (-1 means unlimited).
	MaxAgents        int `json:"max_agents" gorm:"not null;default:1"`
	MaxContacts      int `json:"max_contacts" gorm:"not null;default:500"`
	MaxMessagesMonth int `json:"max_messages_month" gorm:"not null;default:1000"`
	MaxDevices       int `json:"max_devices" gorm:"not null;default:1"`
	MaxUsers         int `json:"max_users" gorm:"not null;default:1"`

	// Features (JSON-encoded list of feature slugs for flexibility).
	Features string `json:"features" gorm:"type:text"`

	IsActive  bool `json:"is_active" gorm:"not null;default:true"`
	IsPopular bool `json:"is_popular" gorm:"not null;default:false"`
	SortOrder int  `json:"sort_order" gorm:"not null;default:0"`

	// Gateway IDs (populated by Service.SyncPlansToStripe).
	StripePriceMonthlyID string `json:"stripe_price_monthly_id" gorm:"size:255"`
	StripePriceYearlyID  string `json:"stripe_price_yearly_id" gorm:"size:255"`
}

// TableName lets hosts override the GORM table name without subclassing.
func (Plan) TableName() string { return "plans" }

// BeforeCreate fills the primary key when absent.
func (p *Plan) BeforeCreate(_ *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
