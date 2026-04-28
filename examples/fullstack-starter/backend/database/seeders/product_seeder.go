package seeders

import (
	"errors"
	"log"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// ProductSeeder loads a small catalog so the dynamic CRUD page has something
// to render on a fresh boot. Idempotent on `sku`.
type ProductSeeder struct{}

func (ProductSeeder) Name() string { return "products" }

func (ProductSeeder) Seed(db *gorm.DB) error {
	orgID, adminID, err := resolveOrgAndAdmin(db)
	if err != nil {
		return err
	}

	demos := []models.Product{
		{Name: "Wireless Headphones", SKU: "DEMO-WH-01", Description: "Over-ear bluetooth headphones", Price: decimal.NewFromFloat(199.00), Stock: 25, Category: "Audio", Status: "active"},
		{Name: "USB-C Hub", SKU: "DEMO-HUB-02", Description: "7-in-1 multiport adapter", Price: decimal.NewFromFloat(49.90), Stock: 120, Category: "Accessories", Status: "active"},
		{Name: "Mechanical Keyboard", SKU: "DEMO-KB-03", Description: "75% layout, hot-swap switches", Price: decimal.NewFromFloat(149.50), Stock: 40, Category: "Peripherals", Status: "active"},
		{Name: `4K Monitor 27"`, SKU: "DEMO-MON-04", Description: "IPS panel, 60Hz, USB-C", Price: decimal.NewFromFloat(389.00), Stock: 15, Category: "Displays", Status: "draft"},
		{Name: "Ergonomic Mouse", SKU: "DEMO-MS-05", Description: "Vertical wireless mouse", Price: decimal.NewFromFloat(59.00), Stock: 80, Category: "Peripherals", Status: "active"},
	}

	created := 0
	for _, p := range demos {
		var existing models.Product
		err := db.Where("sku = ?", p.SKU).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			p.OrganizationID = orgID
			p.CreatedByID = &adminID
			if err := db.Create(&p).Error; err != nil {
				return err
			}
			created++
		} else if err != nil {
			return err
		}
	}
	log.Printf("  ✓ %d/%d products", created, len(demos))
	return nil
}
