package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Subscription represents an organization's subscription to a Plan. The
// model intentionally does NOT preload a host-specific Organization
// relation — hosts can join `organization_id` to their own organizations
// table at the query layer.
type Subscription struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
	CreatedByID *uuid.UUID     `json:"created_by_id,omitempty" gorm:"type:uuid;index"`

	OrganizationID uuid.UUID `json:"organization_id" gorm:"type:uuid;not null;index"`

	PlanID   uuid.UUID `json:"plan_id" gorm:"type:uuid;not null;index"`
	Plan     Plan      `json:"plan,omitempty" gorm:"foreignKey:PlanID"`
	Interval string    `json:"interval" gorm:"size:20;not null"` // monthly | yearly

	// Status: trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired.
	Status string `json:"status" gorm:"size:30;not null;default:'trialing';index"`

	CurrentPeriodStart time.Time  `json:"current_period_start" gorm:"not null"`
	CurrentPeriodEnd   time.Time  `json:"current_period_end" gorm:"not null;index"`
	TrialStart         *time.Time `json:"trial_start,omitempty"`
	TrialEnd           *time.Time `json:"trial_end,omitempty"`
	CanceledAt         *time.Time `json:"canceled_at,omitempty"`
	EndedAt            *time.Time `json:"ended_at,omitempty"`

	// Gateway (stripe, mercadopago, …) — opaque to the SDK; today only the
	// Stripe path is implemented.
	Gateway                string `json:"gateway" gorm:"size:50"`
	GatewaySubscriptionID  string `json:"gateway_subscription_id" gorm:"size:255"`
	GatewayCustomerID      string `json:"gateway_customer_id" gorm:"size:255"`
	GatewayPaymentMethodID string `json:"gateway_payment_method_id" gorm:"size:255"`

	// DunningStage tracks where in the trial-ending lifecycle this
	// subscription is — read/written by the host's dunning sweep so the
	// same warning email isn't sent twice. Empty / "none" means no
	// warning has been emitted yet. Canonical values:
	//   "none"           — no warning sent
	//   "warned_3d"      — T-3 days reminder sent
	//   "warned_1d"      — T-1 day reminder sent
	//   "expired_notified" — T+0 expiration email sent
	//   "grace_expired"  — T+7 downgrade email sent
	// Hosts can extend the vocabulary; SDK consumers should treat
	// unknown values as "already-warned" (defensive: avoids resending).
	DunningStage string `json:"dunning_stage,omitempty" gorm:"size:30;default:'none'"`
}

// TableName lets hosts override the GORM table name without subclassing.
func (Subscription) TableName() string { return "subscriptions" }

// BeforeCreate fills the primary key when absent.
func (s *Subscription) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// IsActive returns true when the subscription still grants access.
func (s *Subscription) IsActive() bool {
	now := time.Now()
	switch s.Status {
	case "trialing", "active":
		return s.CurrentPeriodEnd.After(now)
	default:
		return false
	}
}

// DaysRemaining returns days until subscription ends (>=0).
func (s *Subscription) DaysRemaining() int {
	days := int(time.Until(s.CurrentPeriodEnd).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}
