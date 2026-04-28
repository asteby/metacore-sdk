package seeders

import (
	"errors"
	"log"

	"gorm.io/gorm"

	"github.com/asteby/metacore-kernel/auth"
	"github.com/asteby/metacore-kernel/modelbase"
)

// AdminSeeder creates the default organization plus an owner user. Other
// seeders rely on it because every entity in the starter is org-scoped.
//
// Defaults:
//
//	org:   Demo Org / demo-org / USD / UTC
//	admin: admin@demo.com / admin123 / role=owner
//
// Override via env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ORG_NAME.
type AdminSeeder struct{}

func (AdminSeeder) Name() string { return "admin" }

func (AdminSeeder) Seed(db *gorm.DB) error {
	cfg := readSeedConfig()

	var org modelbase.BaseOrganization
	err := db.Where("slug = ?", cfg.OrgSlug).First(&org).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		org = modelbase.BaseOrganization{
			Name:     cfg.OrgName,
			Slug:     cfg.OrgSlug,
			Country:  cfg.OrgCountry,
			Currency: cfg.OrgCurrency,
			Timezone: cfg.OrgTimezone,
		}
		if err := db.Create(&org).Error; err != nil {
			return err
		}
		log.Printf("  ✓ org %q (%s)", org.Name, org.ID)
	} else if err != nil {
		return err
	}

	var admin modelbase.BaseUser
	err = db.Where("email = ?", cfg.AdminEmail).First(&admin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		hash, hashErr := auth.HashPassword(cfg.AdminPassword, 0)
		if hashErr != nil {
			return hashErr
		}
		admin = modelbase.BaseUser{
			Name:         cfg.AdminName,
			Email:        cfg.AdminEmail,
			PasswordHash: hash,
			Role:         modelbase.RoleOwner,
		}
		admin.OrganizationID = org.ID
		if err := db.Create(&admin).Error; err != nil {
			return err
		}
		log.Printf("  ✓ admin %s (login: %s / %s)", admin.Email, cfg.AdminEmail, cfg.AdminPassword)
	} else if err != nil {
		return err
	}

	return nil
}
