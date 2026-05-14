package billing

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/asteby/metacore-sdk/billing/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FeatureMatrix is the per-org snapshot returned by GET /billing/features.
// It bundles the JSON-encoded feature slugs from Plan.Features with the
// numeric limits (max_agents, max_contacts, …) so the frontend can drive a
// single `useFeature` hook without two roundtrips.
type FeatureMatrix struct {
	PlanSlug    string         `json:"plan_slug"`
	PlanName    string         `json:"plan_name"`
	Features    map[string]bool `json:"features"`
	Limits      map[string]int  `json:"limits"`
	// Trialing is true when the subscription is currently in its trial
	// window — useful for UI banners ("you have access because trial").
	Trialing bool `json:"trialing"`
}

// HasFeature reports whether the org's current plan unlocks the given
// feature key. Returns false on any error (no subscription, plan missing,
// feature absent). Callers should use this for boolean feature flags; for
// numeric limits use GetFeatureMatrix and read Limits[key].
//
// Unconfigured billing service + no subscription row are treated as
// PERMISSIVE (returns true) so a fresh dev environment without seeders run
// doesn't lock everyone out. Production environments will always have a
// subscription record thanks to auth.Register.
func (s *Service) HasFeature(ctx context.Context, orgID uuid.UUID, key string) (bool, error) {
	if key == "" {
		return false, errors.New("billing: feature key is required")
	}
	plan, _, err := s.loadPlanForOrg(ctx, orgID)
	if err != nil {
		// Missing subscription / plan row → permissive. We're not the
		// last line of defense; the route-level guard can be made
		// stricter when the host wants that.
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true, nil
		}
		return false, err
	}
	for _, f := range parseFeatures(plan.Features) {
		if f == key {
			return true, nil
		}
	}
	return false, nil
}

// GetFeatureMatrix returns the org's full feature snapshot. Used by the
// frontend hook so a single call hydrates every gate on the page.
func (s *Service) GetFeatureMatrix(ctx context.Context, orgID uuid.UUID) (*FeatureMatrix, error) {
	plan, sub, err := s.loadPlanForOrg(ctx, orgID)
	if err != nil {
		return nil, err
	}
	keys := parseFeatures(plan.Features)
	features := make(map[string]bool, len(keys))
	for _, k := range keys {
		features[k] = true
	}
	return &FeatureMatrix{
		PlanSlug: plan.Slug,
		PlanName: plan.Name,
		Features: features,
		Limits: map[string]int{
			"agents":             plan.MaxAgents,
			"contacts":           plan.MaxContacts,
			"messages_per_month": plan.MaxMessagesMonth,
			"devices":            plan.MaxDevices,
			"users":              plan.MaxUsers,
		},
		Trialing: sub != nil && sub.Status == "trialing",
	}, nil
}

// loadPlanForOrg resolves the org's most-recent subscription and preloads
// its plan. Returns gorm.ErrRecordNotFound if no subscription exists.
func (s *Service) loadPlanForOrg(_ context.Context, orgID uuid.UUID) (*models.Plan, *models.Subscription, error) {
	var sub models.Subscription
	if err := s.db.Preload("Plan").
		Where("organization_id = ?", orgID).
		Order("created_at DESC").
		First(&sub).Error; err != nil {
		return nil, nil, err
	}
	return &sub.Plan, &sub, nil
}

// parseFeatures decodes Plan.Features (JSON array of strings) defensively
// — returns an empty slice on any parse error so a malformed seed never
// crashes a feature check.
func parseFeatures(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}
