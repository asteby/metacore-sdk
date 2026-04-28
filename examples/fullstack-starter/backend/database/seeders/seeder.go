// Package seeders provides a framework-style demo data loader for the
// Metacore Starter Kit. The pattern mirrors what `link` and `ops` use in
// production: a Seeder interface, a registry, a named lookup and a Reset
// helper. Add a new file with a struct that implements Seeder and append
// it to the slice in RunAllSeeders to wire it in.
package seeders

import (
	"fmt"
	"log"
	"strings"

	"gorm.io/gorm"
)

// Seeder is implemented by anything that loads demo data into the database.
// Seed must be idempotent — running it twice should not create duplicate
// rows, fail on unique constraints, or leak resources.
type Seeder interface {
	Name() string
	Seed(db *gorm.DB) error
}

// All returns the canonical, ordered list of seeders the starter ships
// with. Order matters: organizations and users seed first because every
// other entity is org-scoped, and customers/products before notifications
// so we can reference them.
func All() []Seeder {
	return []Seeder{
		&AdminSeeder{},
		&ProductSeeder{},
		&CustomerSeeder{},
		&NotificationSeeder{},
	}
}

// RunAllSeeders runs every registered seeder inside a single transaction
// with deferred constraints. If any seeder fails the entire batch rolls
// back so the database never stays half-seeded.
func RunAllSeeders(db *gorm.DB) error {
	tx := db.Begin()
	if tx.Error != nil {
		return fmt.Errorf("begin tx: %w", tx.Error)
	}
	if err := tx.Exec("SET CONSTRAINTS ALL DEFERRED").Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("defer constraints: %w", err)
	}
	for _, s := range All() {
		log.Printf("🌱 seed: %s", s.Name())
		if err := s.Seed(tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", s.Name(), err)
		}
	}
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// GetSeederByName resolves a seeder from a case-insensitive substring of
// its Name(). Used by `cmd/seed --only=<name>` for targeted re-seeding.
func GetSeederByName(name string) (Seeder, error) {
	needle := strings.ToLower(strings.TrimSpace(name))
	for _, s := range All() {
		if strings.Contains(strings.ToLower(s.Name()), needle) {
			return s, nil
		}
	}
	available := make([]string, 0, len(All()))
	for _, s := range All() {
		available = append(available, s.Name())
	}
	return nil, fmt.Errorf("no seeder matches %q (available: %s)", name, strings.Join(available, ", "))
}

// ResetDatabase drops every public table managed by the starter so the
// next migration run rebuilds the schema from scratch. Destructive — only
// invoke from `cmd/seed --reset`.
func ResetDatabase(db *gorm.DB) error {
	tables := []string{
		"notifications",
		"customers",
		"products",
		"webhook_deliveries",
		"webhooks",
		"push_subscriptions",
		"users",
		"organizations",
		"goose_db_version",
		"migrations",
	}
	for _, t := range tables {
		if err := db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %q CASCADE", t)).Error; err != nil {
			return fmt.Errorf("drop %s: %w", t, err)
		}
	}
	return nil
}
