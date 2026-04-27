package main

import (
	"errors"
	"log"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/asteby/metacore-kernel/auth"
	"github.com/asteby/metacore-kernel/modelbase"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// SeedDemoData seeds an admin user, a default organization, and a small set
// of demo products + customers so `docker compose up` lands on a fully
// usable starter (login admin@demo.com / admin123).
//
// The function is idempotent: running it multiple times will not create
// duplicates.
func SeedDemoData(db *gorm.DB) error {
	if db == nil {
		return errors.New("seed: db is nil")
	}

	// 1. Organization ------------------------------------------------------
	const orgName = "Demo Org"
	const orgSlug = "demo-org"

	var org modelbase.BaseOrganization
	err := db.Where("slug = ?", orgSlug).First(&org).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		org = modelbase.BaseOrganization{
			Name:     orgName,
			Slug:     orgSlug,
			Country:  "US",
			Currency: "USD",
			Timezone: "UTC",
		}
		if err := db.Create(&org).Error; err != nil {
			return err
		}
		log.Printf("seed: created organization %q (%s)", org.Name, org.ID)
	} else if err != nil {
		return err
	}

	// 2. Admin user --------------------------------------------------------
	const adminEmail = "admin@demo.com"
	const adminPassword = "admin123"

	var admin modelbase.BaseUser
	err = db.Where("email = ?", adminEmail).First(&admin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		hash, hashErr := auth.HashPassword(adminPassword, 0)
		if hashErr != nil {
			return hashErr
		}
		admin = modelbase.BaseUser{
			Name:         "Demo Admin",
			Email:        adminEmail,
			PasswordHash: hash,
			Role:         modelbase.RoleOwner,
		}
		admin.OrganizationID = org.ID
		if err := db.Create(&admin).Error; err != nil {
			return err
		}
		log.Printf("seed: created admin %q (%s)", admin.Email, admin.ID)
	} else if err != nil {
		return err
	} else if admin.OrganizationID == uuid.Nil {
		// Backfill org link for legacy rows.
		admin.OrganizationID = org.ID
		if err := db.Save(&admin).Error; err != nil {
			return err
		}
	}

	// 3. Demo products -----------------------------------------------------
	demoProducts := []models.Product{
		{Name: "Wireless Headphones", SKU: "DEMO-WH-01", Description: "Over-ear bluetooth headphones", Price: decimal.NewFromFloat(199.00), Stock: 25, Category: "Audio", Status: "active"},
		{Name: "USB-C Hub", SKU: "DEMO-HUB-02", Description: "7-in-1 multiport adapter", Price: decimal.NewFromFloat(49.90), Stock: 120, Category: "Accessories", Status: "active"},
		{Name: "Mechanical Keyboard", SKU: "DEMO-KB-03", Description: "75% layout, hot-swap switches", Price: decimal.NewFromFloat(149.50), Stock: 40, Category: "Peripherals", Status: "active"},
		{Name: "4K Monitor 27\"", SKU: "DEMO-MON-04", Description: "IPS panel, 60Hz, USB-C", Price: decimal.NewFromFloat(389.00), Stock: 15, Category: "Displays", Status: "draft"},
		{Name: "Ergonomic Mouse", SKU: "DEMO-MS-05", Description: "Vertical wireless mouse", Price: decimal.NewFromFloat(59.00), Stock: 80, Category: "Peripherals", Status: "active"},
	}
	for _, p := range demoProducts {
		var existing models.Product
		err := db.Where("sku = ?", p.SKU).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			p.OrganizationID = org.ID
			p.CreatedByID = uuidPtr(admin.ID)
			if err := db.Create(&p).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}

	// 4. Demo customers ----------------------------------------------------
	demoCustomers := []models.Customer{
		{Name: "Alice Johnson", Email: "alice@example.com", Phone: "+1-555-0101", Status: "active", Tags: "vip,retail"},
		{Name: "Bob Martinez", Email: "bob@example.com", Phone: "+1-555-0102", Status: "lead", Tags: "wholesale"},
		{Name: "Carla Singh", Email: "carla@example.com", Phone: "+1-555-0103", Status: "active", Tags: "retail"},
	}
	for _, c := range demoCustomers {
		var existing models.Customer
		err := db.Where("email = ?", c.Email).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.OrganizationID = org.ID
			c.CreatedByID = uuidPtr(admin.ID)
			if err := db.Create(&c).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}

	log.Printf("seed: demo data ready (login: %s / %s)", adminEmail, adminPassword)
	return nil
}

func uuidPtr(id uuid.UUID) *uuid.UUID {
	return &id
}
