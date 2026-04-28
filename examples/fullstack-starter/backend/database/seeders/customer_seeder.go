package seeders

import (
	"errors"
	"log"

	"gorm.io/gorm"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// CustomerSeeder loads sample customers spanning the three default
// statuses (active / lead / inactive) so the badge filter has data to
// group by. Idempotent on `email`.
type CustomerSeeder struct{}

func (CustomerSeeder) Name() string { return "customers" }

func (CustomerSeeder) Seed(db *gorm.DB) error {
	orgID, adminID, err := resolveOrgAndAdmin(db)
	if err != nil {
		return err
	}

	demos := []models.Customer{
		{Name: "Alice Johnson", Email: "alice@example.com", Phone: "+1-555-0101", Status: "active", Tags: "vip,retail"},
		{Name: "Bob Martinez", Email: "bob@example.com", Phone: "+1-555-0102", Status: "lead", Tags: "wholesale"},
		{Name: "Carla Singh", Email: "carla@example.com", Phone: "+1-555-0103", Status: "active", Tags: "retail"},
		{Name: "Diego López", Email: "diego@example.com", Phone: "+1-555-0104", Status: "inactive", Tags: "retail"},
		{Name: "Emma Schmidt", Email: "emma@example.com", Phone: "+1-555-0105", Status: "lead", Tags: "vip"},
	}

	created := 0
	for _, c := range demos {
		var existing models.Customer
		err := db.Where("email = ?", c.Email).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.OrganizationID = orgID
			c.CreatedByID = &adminID
			if err := db.Create(&c).Error; err != nil {
				return err
			}
			created++
		} else if err != nil {
			return err
		}
	}
	log.Printf("  ✓ %d/%d customers", created, len(demos))
	return nil
}
