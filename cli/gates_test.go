package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

func TestValidateContract_RejectsModalSlugMismatch(t *testing.T) {
	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "tickets"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "reassign", Modal: "wrong.slug", Handler: v3.Handler{Type: "webhook", URL: "/webhooks/reassign"}},
			},
		},
	}
	r := &gateResult{}
	validateContract(m, r)
	if len(r.errors) == 0 || !strings.Contains(r.errors[0], "tickets.reassign") {
		t.Fatalf("expected modal slug error, got %v", r.errors)
	}
}

func TestValidateContract_RejectsWebhookActionWithoutURL(t *testing.T) {
	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "tickets"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "reassign", Modal: "tickets.reassign", Handler: v3.Handler{Type: "webhook"}},
			},
		},
	}
	r := &gateResult{}
	validateContract(m, r)
	if len(r.errors) == 0 || !strings.Contains(r.errors[0], "handler.url") {
		t.Fatalf("expected missing handler.url error, got %v", r.errors)
	}
}

func TestValidateContract_AllowsConfirmOnlyActionWithoutHandler(t *testing.T) {
	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "tickets"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "archive", Confirm: true},
			},
		},
	}
	r := &gateResult{}
	validateContract(m, r)
	if len(r.errors) != 0 {
		t.Fatalf("unexpected errors: %v", r.errors)
	}
}

func TestScanSQL_RejectsDropRole(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "migrations"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "migrations", "0001.sql"), []byte("DROP ROLE postgres;"), 0o644)
	r := &gateResult{}
	scanSQL(dir, &v3.Manifest{Metadata: v3.Metadata{Key: "demo"}}, r)
	if len(r.errors) == 0 {
		t.Fatalf("expected rejection of DROP ROLE")
	}
}

func TestScanSQL_AllowsBenignCreateTable(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "migrations"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "migrations", "0001.sql"),
		[]byte("-- Initial schema for addon\nCREATE TABLE IF NOT EXISTS items (id uuid PRIMARY KEY);"), 0o644)
	r := &gateResult{}
	scanSQL(dir, &v3.Manifest{Metadata: v3.Metadata{Key: "demo"}}, r)
	if len(r.errors) != 0 {
		t.Fatalf("unexpected errors: %v", r.errors)
	}
	if len(r.warnings) != 0 {
		t.Fatalf("unexpected warnings: %v", r.warnings)
	}
}

func TestScanGo_DetectsMissingHandler(t *testing.T) {
	dir := t.TempDir()
	backend := filepath.Join(dir, "backend")
	_ = os.Mkdir(backend, 0o755)
	_ = os.WriteFile(filepath.Join(backend, "main.go"),
		[]byte(`package main
import "net/http"
func init() { http.HandleFunc("POST /webhooks/other", nil) }`), 0o644)

	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "demo"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "resolve", Handler: v3.Handler{Type: "webhook", URL: "http://x/webhooks/resolve"}},
			},
		},
	}
	r := &gateResult{}
	scanGo(dir, m, r)
	if len(r.errors) == 0 {
		t.Fatalf("expected missing handler error")
	}
}

func TestScanGo_AcceptsRegisteredHandler(t *testing.T) {
	dir := t.TempDir()
	backend := filepath.Join(dir, "backend")
	_ = os.Mkdir(backend, 0o755)
	_ = os.WriteFile(filepath.Join(backend, "main.go"),
		[]byte(`package main
import "net/http"
func init() { http.HandleFunc("POST /webhooks/resolve", nil) }`), 0o644)

	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "demo"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "resolve", Handler: v3.Handler{Type: "webhook", URL: "http://x/webhooks/resolve"}},
			},
		},
	}
	r := &gateResult{}
	scanGo(dir, m, r)
	if len(r.errors) != 0 {
		t.Fatalf("unexpected errors: %v", r.errors)
	}
}

func TestScanTS_DetectsMissingModal(t *testing.T) {
	dir := t.TempDir()
	feSrc := filepath.Join(dir, "frontend", "src")
	_ = os.MkdirAll(feSrc, 0o755)
	_ = os.WriteFile(filepath.Join(feSrc, "plugin.tsx"),
		[]byte(`registerModal({ slug: "demo.other", component: X })`), 0o644)

	m := &v3.Manifest{
		Metadata: v3.Metadata{Key: "demo"},
		Contributions: &v3.Contributions{
			Actions: []v3.Action{
				{Key: "reassign", Modal: "demo.reassign", Handler: v3.Handler{Type: "webhook", URL: "/x"}},
			},
		},
	}
	r := &gateResult{}
	scanTS(dir, m, r)
	if len(r.errors) == 0 {
		t.Fatalf("expected missing modal error")
	}
}
