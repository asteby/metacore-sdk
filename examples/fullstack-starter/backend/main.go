package main

import (
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/asteby/metacore-kernel/auth"
	"github.com/asteby/metacore-kernel/host"
	"github.com/asteby/metacore-kernel/modelbase"
	metacorews "github.com/asteby/metacore-kernel/ws"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

func main() {
	db, err := gorm.Open(postgres.Open(host.MustGetenv("DATABASE_URL")), &gorm.Config{})
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	db.AutoMigrate(&models.Product{}, &models.Customer{}, &models.Notification{})

	vapidPub := os.Getenv("VAPID_PUBLIC_KEY")
	vapidPriv := os.Getenv("VAPID_PRIVATE_KEY")

	app := host.NewApp(host.AppConfig{
		DB:             db,
		JWTSecret:      []byte(host.MustGetenv("JWT_SECRET")),
		EnableWebhooks: true,
		EnableMetrics:  true,
		EnablePush:     vapidPub != "" && vapidPriv != "",
		VAPIDPublic:    vapidPub,
		VAPIDPrivate:   vapidPriv,
		VAPIDSubject:   getenvDefault("VAPID_SUBJECT", "mailto:admin@example.com"),
	})
	app.RegisterModel("products", func() modelbase.ModelDefiner { return &models.Product{} })
	app.RegisterModel("customers", func() modelbase.ModelDefiner { return &models.Customer{} })
	app.RegisterModel("notifications", func() modelbase.ModelDefiner { return &models.Notification{} })

	// Seed demo data so a fresh `docker compose up` is immediately usable.
	// Defaults to enabled; set SEED_DEMO_DATA=false to skip in production.
	if seedEnabled() {
		if err := SeedDemoData(db); err != nil {
			log.Printf("seed: failed to seed demo data: %v", err)
		}
	}

	// When a NOTIFICATION is sent via WebSocket, persist it to DB
	app.WSHub.OnNotification = func(userID uuid.UUID, msg metacorews.Message) {
		type payload struct {
			Title   string `json:"title"`
			Message string `json:"message"`
			Type    string `json:"type"`
			Link    string `json:"link"`
			Icon    string `json:"icon"`
		}
		// Best-effort persistence
		notif := models.Notification{
			UserID:  &userID,
			Title:   "Notification",
			Message: "New notification",
			Type:    "info",
		}
		if p, ok := msg.Payload.(map[string]any); ok {
			if t, _ := p["title"].(string); t != "" {
				notif.Title = t
			}
			if m, _ := p["message"].(string); m != "" {
				notif.Message = m
			}
			if tp, _ := p["type"].(string); tp != "" {
				notif.Type = tp
			}
			if l, _ := p["link"].(string); l != "" {
				notif.Link = l
			}
		}
		notif.OrganizationID = uuid.Nil // will be set by user lookup
		db.Create(&notif)
	}

	fiberApp := fiber.New()
	fiberApp.Use(cors.New(cors.Config{
		AllowOrigins:     getenvDefault("CORS_ORIGINS", "http://localhost:5173"),
		AllowMethods:     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: true,
	}))

	apiRouter := app.Mount(fiberApp.Group("/api"))

	// GET /api/notifications/me — returns current user's notifications
	apiRouter.Get("/notifications/me", func(c *fiber.Ctx) error {
		userID := auth.GetUserID(c)
		var notifs []models.Notification
		db.Where("user_id = ?", userID).Order("created_at DESC").Limit(20).Find(&notifs)
		return c.JSON(fiber.Map{"success": true, "data": notifs})
	})

	// POST /api/test-notification — sends a test notification via WebSocket
	apiRouter.Post("/test-notification", func(c *fiber.Ctx) error {
		userID := auth.GetUserID(c)

		// Save to DB
		notif := models.Notification{
			UserID:  &userID,
			Title:   "Test Notification",
			Message: "This was sent via WebSocket in real-time!",
			Type:    "success",
			Link:    "/m/customers",
			Icon:    "bell",
		}
		db.Create(&notif)

		// Push via WebSocket
		app.WSHub.SendToUser(userID, metacorews.Message{
			Type: metacorews.MsgNotification,
			Payload: map[string]any{
				"id":      notif.ID,
				"title":   notif.Title,
				"message": notif.Message,
				"type":    notif.Type,
				"link":    notif.Link,
				"icon":    notif.Icon,
			},
		})

		return c.JSON(fiber.Map{"success": true, "message": "Notification sent via WebSocket"})
	})

	fiberApp.Get("/healthz", func(c *fiber.Ctx) error { return c.SendString("ok") })

	port := getenvDefault("PORT", "7200")
	log.Printf("🚀 Metacore Starter listening on :%s", port)
	log.Fatal(fiberApp.Listen(":" + port))
}

func getenvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// seedEnabled reports whether SeedDemoData should run on boot. Defaults to
// true so the local/dev/docker-compose experience works out-of-the-box; set
// SEED_DEMO_DATA=false (or 0/no) to disable in production.
func seedEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_DEMO_DATA")))
	switch v {
	case "":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}
