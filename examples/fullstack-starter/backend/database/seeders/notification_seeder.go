package seeders

import (
	"errors"
	"log"

	"gorm.io/gorm"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// NotificationSeeder drops a couple of welcome notifications in the admin's
// inbox so the bell icon and the notifications page light up on first
// boot. Idempotent on (user_id, title).
type NotificationSeeder struct{}

func (NotificationSeeder) Name() string { return "notifications" }

func (NotificationSeeder) Seed(db *gorm.DB) error {
	orgID, adminID, err := resolveOrgAndAdmin(db)
	if err != nil {
		return err
	}

	demos := []models.Notification{
		{Title: "Welcome to Metacore", Message: "Your starter is wired up. Click anywhere to explore.", Type: "info", Icon: "sparkles"},
		{Title: "Try the dynamic CRUD", Message: "Customers and Products are powered by /metadata/all — add a column in Go and watch the UI update.", Type: "success", Icon: "package", Link: "/m/products"},
		{Title: "Real-time ready", Message: "WebSocket hub is live. Hit POST /api/test-notification to push yourself a toast.", Type: "info", Icon: "bell"},
	}

	created := 0
	for _, n := range demos {
		var existing models.Notification
		q := db.Where("user_id = ? AND title = ?", adminID, n.Title)
		err := q.First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			n.OrganizationID = orgID
			n.UserID = &adminID
			if err := db.Create(&n).Error; err != nil {
				return err
			}
			created++
		} else if err != nil {
			return err
		}
	}
	_ = orgID
	log.Printf("  ✓ %d/%d notifications", created, len(demos))
	return nil
}
