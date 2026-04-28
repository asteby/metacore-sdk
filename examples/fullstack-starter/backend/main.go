// Metacore Starter — fullstack reference app.
//
// Boots the kernel via host.NewApp (auth + metadata + dynamic CRUD +
// webhooks + push + metrics + websocket) and registers three demo
// models. Schema is created by kernel migrations; demo content by the
// seeder framework in database/seeders. Both run idempotently when
// SEED_DEMO_DATA=true.
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
	kmigrations "github.com/asteby/metacore-kernel/migrations"
	"github.com/asteby/metacore-kernel/modelbase"
	metacorews "github.com/asteby/metacore-kernel/ws"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/database/seeders"
	starteri18n "github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/i18n"
	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// appModels lists the domain entities owned by the starter. Kernel-owned
// tables (users, organizations, webhooks, push_subscriptions) are migrated
// by host.NewApp via its versioned goose runner.
var appModels = []any{
	&models.Product{},
	&models.Customer{},
	&models.Notification{},
}

func main() {
	db, err := gorm.Open(postgres.Open(host.MustGetenv("DATABASE_URL")), &gorm.Config{})
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	vapidPub := os.Getenv("VAPID_PUBLIC_KEY")
	vapidPriv := os.Getenv("VAPID_PRIVATE_KEY")

	// host.NewApp wires the kernel stack. AutoMigrate creates kernel-owned
	// tables (users, organizations, webhooks, push_subscriptions) the
	// first time you boot. Production deployments should run
	// `cmd/seed --migrate` from a one-shot job and disable in-process
	// migration in a custom kernel configuration.
	defaultLang := getenvDefault("DEFAULT_LANGUAGE", "es")
	translator := starteri18n.MustNew(defaultLang)

	app := host.NewApp(host.AppConfig{
		DB:                  db,
		JWTSecret:           []byte(host.MustGetenv("JWT_SECRET")),
		EnableWebhooks:      true,
		EnableMetrics:       true,
		EnablePush:          vapidPub != "" && vapidPriv != "",
		VAPIDPublic:         vapidPub,
		VAPIDPrivate:        vapidPriv,
		VAPIDSubject:        getenvDefault("VAPID_SUBJECT", "mailto:admin@example.com"),
		Translator:          translator,
		I18nDefaultLanguage: defaultLang,
	})

	// Domain tables — topo-sorted AutoMigrate keeps FKs in order.
	if err := kmigrations.AutoMigrate(db, appModels); err != nil {
		log.Fatalf("migrate app models: %v", err)
	}

	app.RegisterModel("products", func() modelbase.ModelDefiner { return &models.Product{} })
	app.RegisterModel("customers", func() modelbase.ModelDefiner { return &models.Customer{} })
	app.RegisterModel("notifications", func() modelbase.ModelDefiner { return &models.Notification{} })

	// Demo content — the seeders framework lives next to the models so a
	// new entity ships its own seeder file. Boot-time seeding is opt-out
	// via SEED_DEMO_DATA=false; production deployments should run
	// `cmd/seed --seed` from a one-shot job instead.
	if seedEnabled() {
		if err := seeders.RunAllSeeders(db); err != nil {
			log.Printf("seed: %v", err)
		}
	}

	// Persist every WebSocket notification so the bell dropdown survives
	// reloads. Kernel exposes the hook; the starter just stores the row.
	app.WSHub.OnNotification = func(userID uuid.UUID, msg metacorews.Message) {
		notif := models.Notification{
			UserID:  &userID,
			Title:   "Notification",
			Message: "New notification",
			Type:    "info",
		}
		if p, ok := msg.Payload.(map[string]any); ok {
			if v, _ := p["title"].(string); v != "" {
				notif.Title = v
			}
			if v, _ := p["message"].(string); v != "" {
				notif.Message = v
			}
			if v, _ := p["type"].(string); v != "" {
				notif.Type = v
			}
			if v, _ := p["link"].(string); v != "" {
				notif.Link = v
			}
		}
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

	apiRouter.Get("/notifications/me", func(c *fiber.Ctx) error {
		userID := auth.GetUserID(c)
		var notifs []models.Notification
		db.Where("user_id = ?", userID).Order("created_at DESC").Limit(20).Find(&notifs)
		return c.JSON(fiber.Map{"success": true, "data": notifs})
	})

	apiRouter.Post("/test-notification", func(c *fiber.Ctx) error {
		userID := auth.GetUserID(c)
		notif := models.Notification{
			UserID:  &userID,
			Title:   "Test Notification",
			Message: "This was sent via WebSocket in real-time!",
			Type:    "success",
			Link:    "/m/customers",
			Icon:    "bell",
		}
		db.Create(&notif)
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

func seedEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_DEMO_DATA")))
	switch v {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}
