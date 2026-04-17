package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/asteby/metacore-kernel/manifest"
)

// gateResult accumulates strict errors and non-strict warnings so the CLI can
// print them in one pass and gate the build on presence of errors.
type gateResult struct {
	errors   []string
	warnings []string
}

func (g *gateResult) errf(format string, args ...any)  { g.errors = append(g.errors, fmt.Sprintf(format, args...)) }
func (g *gateResult) warnf(format string, args ...any) { g.warnings = append(g.warnings, fmt.Sprintf(format, args...)) }

// runGates validates the manifest contract and scans backend/frontend/migrations
// for parity with what the manifest declares. strict converts warnings into
// errors.
func runGates(srcDir string, m *manifest.Manifest, strict bool) error {
	r := &gateResult{}
	validateContract(m, r)
	scanGo(srcDir, m, r)
	scanTS(srcDir, m, r)
	scanSQL(srcDir, m, r)
	scanWASM(srcDir, m, r)

	for _, w := range r.warnings {
		fmt.Fprintf(os.Stderr, "warning: %s\n", w)
		if strict {
			r.errors = append(r.errors, "strict: "+w)
		}
	}
	if len(r.errors) > 0 {
		for _, e := range r.errors {
			fmt.Fprintf(os.Stderr, "error: %s\n", e)
		}
		return fmt.Errorf("%d gate error(s)", len(r.errors))
	}
	return nil
}

// validateContract enforces the key ↔ modal ↔ hook ↔ tool invariants that tie
// backend handlers, frontend modals and LLM-facing tools to a single addon key.
func validateContract(m *manifest.Manifest, r *gateResult) {
	for model, actions := range m.Actions {
		for _, a := range actions {
			if a.Modal != "" {
				expected := m.Key + "." + a.Key
				if a.Modal != expected {
					r.errf("actions[%q][%q].modal = %q; must be %q to match addon_key.action_key", model, a.Key, a.Modal, expected)
				}
			}
			// A hook URL is required unless the action is confirm-only
			// (no fields, no modal) — in which case the host handles it
			// locally without calling out.
			confirmOnly := a.Confirm && a.Modal == "" && len(a.Fields) == 0
			hookKey := model + "::" + a.Key
			if _, ok := m.Hooks[hookKey]; !ok && !confirmOnly {
				r.errf("hooks[%q] missing — actions[%q][%q] needs a webhook endpoint", hookKey, model, a.Key)
			}
		}
	}
	// Tools sharing a key with an action must point at the same endpoint so
	// the backend handler doesn't need to branch on invocation type.
	for _, t := range m.Tools {
		for model, actions := range m.Actions {
			for _, a := range actions {
				if t.ID != a.Key {
					continue
				}
				hookKey := model + "::" + a.Key
				hookURL := m.Hooks[hookKey]
				if hookURL == "" || t.Endpoint == "" {
					continue
				}
				if !endpointsMatch(hookURL, t.Endpoint) {
					r.errf("tools[%q].endpoint=%q differs from hooks[%q]=%q — twin tool/action must share the endpoint", t.ID, t.Endpoint, hookKey, hookURL)
				}
			}
		}
	}
}

func endpointsMatch(a, b string) bool {
	ca, cb := canonicalPath(a), canonicalPath(b)
	return ca == cb
}

func canonicalPath(u string) string {
	// Compare by trailing path component — hosts may differ (dev vs prod host)
	// but the route should be the same.
	if i := strings.Index(u, "://"); i >= 0 {
		u = u[i+3:]
		if j := strings.Index(u, "/"); j >= 0 {
			u = u[j:]
		} else {
			u = "/"
		}
	}
	return strings.TrimRight(u, "/")
}

// scanGo greps the backend/ directory for mux.HandleFunc("<method> <path>", ...)
// registrations and ensures every hook path declared in the manifest is served.
// When no backend/ exists the scan is skipped — some addons are frontend-only.
var goHandleFuncRe = regexp.MustCompile(`HandleFunc\s*\(\s*"(?:[A-Z]+\s+)?([^"]+)"`)

func scanGo(srcDir string, m *manifest.Manifest, r *gateResult) {
	backend := filepath.Join(srcDir, "backend")
	if _, err := os.Stat(backend); err != nil {
		return
	}
	registered := map[string]bool{}
	_ = filepath.Walk(backend, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(p, ".go") {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		for _, m := range goHandleFuncRe.FindAllSubmatch(data, -1) {
			registered[string(m[1])] = true
		}
		return nil
	})
	for key, hookURL := range m.Hooks {
		path := canonicalPath(hookURL)
		if !anyMatchesSuffix(registered, path) {
			r.errf("hooks[%q] points at %q but no HandleFunc for that path found under backend/", key, path)
		}
	}
}

func anyMatchesSuffix(registered map[string]bool, target string) bool {
	if registered[target] {
		return true
	}
	// Some handlers register the trailing path only (e.g. "/webhooks/resolve");
	// the hook may be an absolute URL. We matched via canonicalPath already so
	// this branch only tolerates extra leading segments in the hook URL.
	for p := range registered {
		if strings.HasSuffix(target, p) {
			return true
		}
	}
	return false
}

// scanTS greps frontend/src/ for registerModal({ slug: "..." }) calls and
// ensures every action.modal declared in the manifest is implemented.
var tsRegisterModalRe = regexp.MustCompile(`registerModal\s*\(\s*\{\s*slug\s*:\s*["']([^"']+)["']`)
var tsLegacyRegisterRe = regexp.MustCompile(`registerActionComponent\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']`)

func scanTS(srcDir string, m *manifest.Manifest, r *gateResult) {
	feSrc := filepath.Join(srcDir, "frontend", "src")
	if _, err := os.Stat(feSrc); err != nil {
		return
	}
	slugs := map[string]bool{}
	_ = filepath.Walk(feSrc, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(p, ".ts") && !strings.HasSuffix(p, ".tsx") {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		for _, match := range tsRegisterModalRe.FindAllSubmatch(data, -1) {
			slugs[string(match[1])] = true
		}
		for _, match := range tsLegacyRegisterRe.FindAllSubmatch(data, -1) {
			// Legacy form registers (model, actionKey) — synthesize the slug.
			slugs[m.Key+"."+string(match[2])] = true
			// Also accept the bare "<model>::<action>" style as a hit.
			slugs[string(match[1])+"::"+string(match[2])] = true
		}
		return nil
	})
	for _, actions := range m.Actions {
		for _, a := range actions {
			if a.Modal == "" {
				continue
			}
			if !slugs[a.Modal] {
				r.errf("action.modal %q declared in manifest but no registerModal/registerActionComponent found under frontend/src/", a.Modal)
			}
		}
	}
}

// scanSQL rejects migrations that use dangerous statements a malicious publisher
// could sneak past the installer. Not bulletproof — a parser would be — but it
// closes the cheap-exfiltration vectors.
var sqlDenyRe = regexp.MustCompile(`(?i)\b(DROP\s+ROLE|ALTER\s+ROLE|CREATE\s+ROLE|GRANT\s+|REVOKE\s+|COPY\s+[^\n]*FROM\s+PROGRAM|pg_read_server_files|pg_ls_dir|\\copy\s+[^\n]*PROGRAM)\b`)
// Match only DDL that targets a schema, not the word "schema" in comments.
var sqlSchemaRe = regexp.MustCompile(`(?i)\b(?:CREATE|ALTER|DROP|SET\s+search_path\s*=)\s+SCHEMA\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)`)

func scanSQL(srcDir string, m *manifest.Manifest, r *gateResult) {
	migDir := filepath.Join(srcDir, "migrations")
	entries, err := os.ReadDir(migDir)
	if err != nil {
		return
	}
	allowedSchema := "addon_" + strings.ToLower(m.Key)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(migDir, e.Name()))
		if err != nil {
			continue
		}
		if loc := sqlDenyRe.FindIndex(data); loc != nil {
			r.errf("migrations/%s: forbidden statement at offset %d (role/COPY PROGRAM/pg_* functions are not allowed in addon migrations)", e.Name(), loc[0])
		}
		for _, match := range sqlSchemaRe.FindAllSubmatch(data, -1) {
			schema := strings.ToLower(string(match[1]))
			if schema == "public" || schema == allowedSchema {
				continue
			}
			r.warnf("migrations/%s: references schema %q — addons should only touch %q or public", e.Name(), schema, allowedSchema)
		}
	}
}
