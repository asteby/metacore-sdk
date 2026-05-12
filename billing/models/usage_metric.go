package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UsageMetric is a per-org, per-metric, per-month counter used by the
// quota-enforcement middleware. One row per (organization, metric,
// period_start).
//
// New metrics can be added without a schema change — just start writing
// rows with a new metric name. Hosts decide which metrics matter:
// "messages", "conversations", "agents", "devices", …
type UsageMetric struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
	CreatedByID *uuid.UUID     `json:"created_by_id,omitempty" gorm:"type:uuid;index"`

	OrganizationID uuid.UUID `json:"organization_id" gorm:"type:uuid;not null;index:idx_usage_org_metric_period,unique"`
	Metric         string    `json:"metric" gorm:"size:50;not null;index:idx_usage_org_metric_period,unique"`
	PeriodStart    time.Time `json:"period_start" gorm:"not null;index:idx_usage_org_metric_period,unique"`
	Count          int       `json:"count" gorm:"not null;default:0"`
}

// TableName lets hosts override the GORM table name without subclassing.
func (UsageMetric) TableName() string { return "usage_metrics" }

// BeforeCreate fills the primary key when absent.
func (u *UsageMetric) BeforeCreate(_ *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// CurrentMonthStart returns the first instant of the current calendar
// month in UTC. Used as the canonical period_start for monthly counters.
func CurrentMonthStart() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}
