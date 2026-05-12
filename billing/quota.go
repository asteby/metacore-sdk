package billing

import (
	"context"

	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// IncrementMetric atomically increments a usage counter for the current
// calendar month. Creates the row on first hit. Safe under concurrent
// writes via ON CONFLICT DO UPDATE.
//
// Call this AFTER the action succeeds (e.g. after a message is sent,
// after an agent is created) so failures don't burn quota.
func IncrementMetric(ctx context.Context, db *gorm.DB, orgID uuid.UUID, metric string, by int) error {
	if by == 0 {
		return nil
	}
	period := models.CurrentMonthStart()
	row := models.UsageMetric{
		OrganizationID: orgID,
		Metric:         metric,
		PeriodStart:    period,
		Count:          by,
	}
	return db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "organization_id"},
				{Name: "metric"},
				{Name: "period_start"},
			},
			DoUpdates: clause.Assignments(map[string]any{
				"count": gorm.Expr("usage_metrics.count + ?", by),
			}),
		}).
		Create(&row).Error
}

// MetricFor returns the current month's count for a metric, or 0.
func MetricFor(db *gorm.DB, orgID uuid.UUID, metric string) int {
	var um models.UsageMetric
	err := db.Where("organization_id = ? AND metric = ? AND period_start = ?",
		orgID, metric, models.CurrentMonthStart()).First(&um).Error
	if err != nil {
		return 0
	}
	return um.Count
}
