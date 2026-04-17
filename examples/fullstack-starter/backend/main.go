package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/asteby/metacore-kernel/host"
	"github.com/asteby/metacore-kernel/modelbase"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

func main() {
	db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")), &gorm.Config{})
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	db.AutoMigrate(&models.Product{}, &models.Customer{})

	app := host.NewApp(host.AppConfig{
		DB:             db,
		JWTSecret:      []byte(host.MustGetenv("JWT_SECRET")),
		EnableWebhooks: true,
		EnablePush:     true,
		VAPIDPublic:    os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivate:   os.Getenv("VAPID_PRIVATE_KEY"),
	})
	app.RegisterModel("products", func() modelbase.ModelDefiner { return &models.Product{} })
	app.RegisterModel("customers", func() modelbase.ModelDefiner { return &models.Customer{} })

	fiberApp := fiber.New()
	fiberApp.Use(cors.New(cors.Config{AllowOrigins: os.Getenv("CORS_ORIGINS")}))
	app.Mount(fiberApp.Group("/api"))
	fiberApp.Get("/healthz", func(c *fiber.Ctx) error { return c.SendString("ok") })

	log.Fatal(fiberApp.Listen(":" + os.Getenv("PORT")))
}
