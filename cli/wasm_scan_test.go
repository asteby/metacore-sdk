package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asteby/metacore-kernel/manifest"
)

// buildMinimalWASM emits a syntactically valid WebAssembly module whose only
// non-header content is an Export section listing `names`. Each export is of
// kind=0 (function) with index=0 — the Function/Code sections are omitted,
// which is illegal for a real runtime but sufficient for our export-name
// parser.
func buildMinimalWASM(names []string) []byte {
	var out []byte
	out = append(out, 0x00, 0x61, 0x73, 0x6d) // magic "\x00asm"
	v := make([]byte, 4)
	binary.LittleEndian.PutUint32(v, 1)
	out = append(out, v...) // version 1

	// Build Export section payload: count(uleb) + entries.
	var payload []byte
	payload = append(payload, uleb128(uint64(len(names)))...)
	for _, n := range names {
		payload = append(payload, uleb128(uint64(len(n)))...)
		payload = append(payload, []byte(n)...)
		payload = append(payload, 0x00) // kind=func
		payload = append(payload, 0x00) // index=0
	}

	// Section: id=7 size=uleb(len(payload)) payload.
	out = append(out, 0x07)
	out = append(out, uleb128(uint64(len(payload)))...)
	out = append(out, payload...)
	return out
}

func uleb128(v uint64) []byte {
	var b []byte
	for {
		c := byte(v & 0x7f)
		v >>= 7
		if v != 0 {
			c |= 0x80
		}
		b = append(b, c)
		if v == 0 {
			return b
		}
	}
}

func TestParseWASMExports_RoundTrip(t *testing.T) {
	data := buildMinimalWASM([]string{"stamp_fiscal", "cancel_fiscal"})
	got, err := parseWASMExports(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 2 || got[0] != "stamp_fiscal" || got[1] != "cancel_fiscal" {
		t.Fatalf("unexpected exports: %v", got)
	}
}

func writeWASM(t *testing.T, dir string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, "backend"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "backend", "backend.wasm"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestScanWASM_OK(t *testing.T) {
	dir := t.TempDir()
	writeWASM(t, dir, buildMinimalWASM([]string{"stamp_fiscal", "cancel_fiscal"}))
	m := &manifest.Manifest{
		Key: "fiscal",
		Backend: &manifest.BackendSpec{
			Runtime: "wasm",
			Entry:   "backend/backend.wasm",
			Exports: []string{"stamp_fiscal", "cancel_fiscal"},
		},
		Hooks: map[string]string{
			"fiscal_documents::stamp_fiscal":  "/webhooks/stamp_fiscal",
			"fiscal_documents::cancel_fiscal": "/webhooks/cancel_fiscal",
		},
	}
	r := &gateResult{}
	scanWASM(dir, m, r)
	if len(r.errors) != 0 {
		t.Fatalf("expected no errors, got %v", r.errors)
	}
}

func TestScanWASM_MissingExport(t *testing.T) {
	dir := t.TempDir()
	// wasm only exports stamp_fiscal; manifest also declares cancel_fiscal.
	writeWASM(t, dir, buildMinimalWASM([]string{"stamp_fiscal"}))
	m := &manifest.Manifest{
		Key: "fiscal",
		Backend: &manifest.BackendSpec{
			Runtime: "wasm",
			Entry:   "backend/backend.wasm",
			Exports: []string{"stamp_fiscal", "cancel_fiscal"},
		},
		Hooks: map[string]string{
			"fiscal_documents::cancel_fiscal": "/webhooks/cancel_fiscal",
		},
	}
	r := &gateResult{}
	scanWASM(dir, m, r)
	if len(r.errors) == 0 {
		t.Fatalf("expected error for missing cancel_fiscal export")
	}
	joined := strings.Join(r.errors, "\n")
	if !strings.Contains(joined, "cancel_fiscal") {
		t.Fatalf("expected error to mention cancel_fiscal, got %v", r.errors)
	}
}

func TestScanWASM_NilBackendSkips(t *testing.T) {
	dir := t.TempDir()
	m := &manifest.Manifest{Key: "frontend_only"}
	r := &gateResult{}
	scanWASM(dir, m, r)
	if len(r.errors) != 0 || len(r.warnings) != 0 {
		t.Fatalf("expected skip, got errors=%v warnings=%v", r.errors, r.warnings)
	}
}

func TestScanWASM_WebhookRuntimeSkips(t *testing.T) {
	dir := t.TempDir()
	m := &manifest.Manifest{
		Key:     "webhook_only",
		Backend: &manifest.BackendSpec{Runtime: "webhook"},
	}
	r := &gateResult{}
	scanWASM(dir, m, r)
	if len(r.errors) != 0 {
		t.Fatalf("expected skip for webhook runtime, got %v", r.errors)
	}
}
