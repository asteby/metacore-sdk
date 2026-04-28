// Command seed runs database migrations and demo seeders for the
// Metacore Starter Kit. The same binary the docker-compose target runs
// on every boot — pull it apart with flags when you want fine-grained
// control:
//
//	go run ./cmd/seed              # migrate + seed everything (default)
//	go run ./cmd/seed --migrate    # migrate only, skip seeders
//	go run ./cmd/seed --seed       # seed only, skip migrations
//	go run ./cmd/seed --reset      # drop every starter table, then migrate + seed
//	go run ./cmd/seed --only=admin # run a single seeder by Name() substring
//	go run ./cmd/seed --list       # print every seeder available
//
// The seed framework is in database/seeders/. Add a new file with a
// struct that implements seeders.Seeder and append it to seeders.All().
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/asteby/metacore-kernel/host"
	kmigrations "github.com/asteby/metacore-kernel/migrations"
	"github.com/asteby/metacore-kernel/modelbase"
	"github.com/asteby/metacore-kernel/push"
	"github.com/asteby/metacore-kernel/webhooks"

	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/database/seeders"
	"github.com/asteby/metacore-sdk/examples/fullstack-starter/backend/models"
)

// allModels covers kernel-owned tables (users, orgs, webhooks, push) plus
// the starter's domain entities. Listing them here keeps `cmd/seed
// --migrate` self-contained — no need to spin up the full Fiber stack
// just to apply schema changes.
var allModels = []any{
	&modelbase.BaseUser{},
	&modelbase.BaseOrganization{},
	&webhooks.Webhook{},
	&webhooks.WebhookDelivery{},
	&push.PushSubscription{},
	&models.Product{},
	&models.Customer{},
	&models.Notification{},
}

func main() {
	migratePtr := flag.Bool("migrate", false, "Run schema migrations only")
	seedPtr := flag.Bool("seed", false, "Run seeders only")
	resetPtr := flag.Bool("reset", false, "Drop all tables before migrate + seed (DESTRUCTIVE)")
	onlyPtr := flag.String("only", "", "Run a single seeder whose Name() contains this substring")
	listPtr := flag.Bool("list", false, "List all registered seeders and exit")
	flag.Parse()

	if *listPtr {
		printSeeders()
		return
	}

	// Default behavior: do everything.
	runMigrate := *migratePtr || (!*migratePtr && !*seedPtr)
	runSeed := *seedPtr || (!*migratePtr && !*seedPtr)

	db, err := gorm.Open(postgres.Open(host.MustGetenv("DATABASE_URL")), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent), // seeders log their own progress
	})
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	if *resetPtr {
		if !confirmReset() {
			log.Println("aborted.")
			return
		}
		log.Println("🔄 reset: dropping starter tables…")
		if err := seeders.ResetDatabase(db); err != nil {
			log.Fatalf("reset: %v", err)
		}
	}

	if runMigrate {
		log.Println("📦 migrate: kernel + app models…")
		if err := kmigrations.AutoMigrate(db, allModels); err != nil {
			log.Fatalf("migrate: %v", err)
		}
		log.Println("✅ migrations applied")
	}

	if *onlyPtr != "" {
		s, err := seeders.GetSeederByName(*onlyPtr)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("🌱 seeder: %s", s.Name())
		if err := s.Seed(db); err != nil {
			log.Fatalf("seed %s: %v", s.Name(), err)
		}
		log.Println("✅ seeder done")
		return
	}

	if runSeed {
		log.Println("🌱 seeders: running all…")
		if err := seeders.RunAllSeeders(db); err != nil {
			log.Fatalf("seed: %v", err)
		}
		log.Println("✅ seeders done")
	}
}

func printSeeders() {
	fmt.Println("Registered seeders (run with --only=<name>):")
	for _, s := range seeders.All() {
		fmt.Printf("  - %s\n", s.Name())
	}
}

func confirmReset() bool {
	if strings.EqualFold(os.Getenv("SEED_RESET_CONFIRM"), "yes") {
		return true
	}
	fmt.Print("⚠️  --reset will DROP every starter table. Continue? type 'yes' to proceed: ")
	var ans string
	fmt.Scanln(&ans)
	return strings.EqualFold(strings.TrimSpace(ans), "yes")
}
