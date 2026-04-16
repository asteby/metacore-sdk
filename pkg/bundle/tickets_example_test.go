package bundle_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/asteby/metacore-sdk/pkg/bundle"
	"github.com/asteby/metacore-sdk/pkg/dynamic"
	"github.com/asteby/metacore-sdk/pkg/manifest"
)

// TestTicketsExampleEndToEnd exercises the build→read pipeline that the
// `metacore` CLI performs, operating on the real tickets addon under
// examples/tickets-addon. It stays inside t.TempDir() for outputs and
// guarantees the reference addon continues to pass Validate against the
// kernel API version.
func TestTicketsExampleEndToEnd(t *testing.T) {
	_, here, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(here), "..", ".."))
	addon := filepath.Join(root, "examples", "tickets-addon")

	// Load manifest exactly like the CLI would.
	mb, err := os.ReadFile(filepath.Join(addon, "manifest.json"))
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	var m manifest.Manifest
	if err := json.Unmarshal(mb, &m); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	if err := m.Validate(manifest.APIVersion); err != nil {
		t.Fatalf("tickets manifest invalid: %v", err)
	}

	b := &bundle.Bundle{Manifest: m, Frontend: map[string][]byte{}}

	migEntries, err := os.ReadDir(filepath.Join(addon, "migrations"))
	if err != nil {
		t.Fatalf("read migrations: %v", err)
	}
	for _, e := range migEntries {
		data, err := os.ReadFile(filepath.Join(addon, "migrations", e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		b.Migrations = append(b.Migrations, dynamic.File{
			Version: e.Name()[:len(e.Name())-len(".sql")],
			SQL:     string(data),
		})
	}
	if len(b.Migrations) < 2 {
		t.Fatalf("want >=2 migrations, got %d", len(b.Migrations))
	}

	feRoot := filepath.Join(addon, "frontend")
	_ = filepath.Walk(feRoot, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(addon, p)
		data, _ := os.ReadFile(p)
		b.Frontend[filepath.ToSlash(rel)] = data
		return nil
	})
	if rd, err := os.ReadFile(filepath.Join(addon, "README.md")); err == nil {
		b.Readme = string(rd)
	}

	out := filepath.Join(t.TempDir(), "tickets-1.0.0.tar.gz")
	f, err := os.Create(out)
	if err != nil {
		t.Fatal(err)
	}
	if err := bundle.Write(f, b); err != nil {
		t.Fatalf("Write: %v", err)
	}
	f.Close()

	// Inspect step — read it back like `metacore inspect`.
	rf, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer rf.Close()
	got, err := bundle.Read(rf, 0)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got.Manifest.Key != "tickets" || got.Manifest.Version != "1.0.0" {
		t.Fatalf("manifest mismatch: %+v", got.Manifest)
	}
	if len(got.Migrations) != len(b.Migrations) {
		t.Fatalf("migration count mismatch: want %d got %d", len(b.Migrations), len(got.Migrations))
	}
	if got.Migrations[0].Version != "0001_init" || got.Migrations[1].Version != "0002_seed_indexes" {
		t.Fatalf("migrations out of order: %+v", got.Migrations)
	}
	if got.Readme == "" {
		t.Fatalf("readme not preserved")
	}
	t.Logf("bundle ok: %s — %d migrations, %d frontend files, %d bytes readme, raw=%d",
		out, len(got.Migrations), len(got.Frontend), len(got.Readme), got.RawSize)
}
