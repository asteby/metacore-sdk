package seeders

import (
	"errors"
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/asteby/metacore-kernel/modelbase"
)

// seedConfig collects every tunable knob the seeders read from env so the
// hardcoding stays in one place — anyone forking the starter overrides
// without touching code.
type seedConfig struct {
	OrgName     string
	OrgSlug     string
	OrgCountry  string
	OrgCurrency string
	OrgTimezone string

	AdminName     string
	AdminEmail    string
	AdminPassword string
}

func readSeedConfig() seedConfig {
	return seedConfig{
		OrgName:     getenv("SEED_ORG_NAME", "Demo Org"),
		OrgSlug:     getenv("SEED_ORG_SLUG", "demo-org"),
		OrgCountry:  getenv("SEED_ORG_COUNTRY", "US"),
		OrgCurrency: getenv("SEED_ORG_CURRENCY", "USD"),
		OrgTimezone: getenv("SEED_ORG_TIMEZONE", "UTC"),

		AdminName:     getenv("SEED_ADMIN_NAME", "Demo Admin"),
		AdminEmail:    getenv("SEED_ADMIN_EMAIL", "admin@demo.com"),
		AdminPassword: getenv("SEED_ADMIN_PASSWORD", "admin123"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// resolveOrgAndAdmin loads the seeded org + admin so dependent seeders can
// scope rows to them. Falls back to env-driven defaults from readSeedConfig.
func resolveOrgAndAdmin(db *gorm.DB) (orgID, adminID uuid.UUID, err error) {
	cfg := readSeedConfig()

	var org modelbase.BaseOrganization
	if err := db.Where("slug = ?", cfg.OrgSlug).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return uuid.Nil, uuid.Nil, errors.New("admin seeder must run first (org not found)")
		}
		return uuid.Nil, uuid.Nil, err
	}

	var admin modelbase.BaseUser
	if err := db.Where("email = ?", cfg.AdminEmail).First(&admin).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return uuid.Nil, uuid.Nil, errors.New("admin seeder must run first (user not found)")
		}
		return uuid.Nil, uuid.Nil, err
	}
	return org.ID, admin.ID, nil
}
