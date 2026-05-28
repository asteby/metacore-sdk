package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	v3 "github.com/asteby/metacore-kernel/manifest/v3"
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
func runGates(srcDir string, m *v3.Manifest, strict bool) error {
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

// actions returns every contributed action, or nil when the manifest has no
// contributions block. Centralises the nil-guard the scans share.
func actionsOf(m *v3.Manifest) []v3.Action {
	if m.Contributions == nil {
		return nil
	}
	return m.Contributions.Actions
}

func toolsOf(m *v3.Manifest) []v3.Tool {
	if m.Contributions == nil {
		return nil
	}
	return m.Contributions.Tools
}

func subscriptionsOf(m *v3.Manifest) []v3.Subscription {
	if m.Contributions == nil {
		return nil
	}
	return m.Contributions.Subscriptions
}

// validateContract enforces the key ↔ modal ↔ handler ↔ tool invariants that
// tie federated modals, webhook handlers and LLM-facing tools to a single
// addon key under the v3 contract.
func validateContract(m *v3.Manifest, r *gateResult) {
	key := m.Metadata.Key
	for _, a := range actionsOf(m) {
		// A custom federated modal must be addressed as <addon_key>.<action_key>
		// so the host can resolve the slot to this addon's frontend bundle.
		if a.Modal != "" {
			expected := key + "." + a.Key
			if a.Modal != expected {
				r.errf("contributions.actions[%q].modal = %q; must be %q to match addon_key.action_key", a.Key, a.Modal, expected)
			}
		}
		// Every action that is more than a confirm-only click needs a handler.
		// A webhook handler must carry a URL; a wasm handler must name a
		// function (which doubles as the export the compiled module must ship).
		confirmOnly := a.Confirm && a.Modal == "" && len(a.Fields) == 0
		switch a.Handler.Type {
		case "webhook":
			if strings.TrimSpace(a.Handler.URL) == "" && !confirmOnly {
				r.errf("contributions.actions[%q].handler.url is empty — a webhook action needs an endpoint", a.Key)
			}
		case "wasm":
			if strings.TrimSpace(a.Handler.Function) == "" {
				r.errf("contributions.actions[%q].handler.function is empty — a wasm action must name an exported function", a.Key)
			}
		case "":
			if !confirmOnly {
				r.errf("contributions.actions[%q].handler.type is empty — set wasm|webhook or make the action confirm-only", a.Key)
			}
		}
	}
	// Tools that share a key with an action and dispatch by webhook must point
	// at the same endpoint so the backend handler doesn't branch on invocation
	// type.
	for _, t := range toolsOf(m) {
		if t.Handler.Type != "webhook" || t.Handler.URL == "" {
			continue
		}
		for _, a := range actionsOf(m) {
			if t.Key != a.Key || a.Handler.Type != "webhook" || a.Handler.URL == "" {
				continue
			}
			if !endpointsMatch(a.Handler.URL, t.Handler.URL) {
				r.errf("contributions.tools[%q].handler.url=%q differs from the twin action handler.url=%q — they must share the endpoint", t.Key, t.Handler.URL, a.Handler.URL)
			}
		}
	}
}

func endpointsMatch(a, b string) bool {
	return canonicalPath(a) == canonicalPath(b)
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

// webhookURLs collects every webhook handler URL declared across actions,
// tools and subscriptions — the v3 replacement for the v2 Hooks map.
func webhookURLs(m *v3.Manifest) []string {
	var out []string
	for _, a := range actionsOf(m) {
		if a.Handler.Type == "webhook" && a.Handler.URL != "" {
			out = append(out, a.Handler.URL)
		}
	}
	for _, t := range toolsOf(m) {
		if t.Handler.Type == "webhook" && t.Handler.URL != "" {
			out = append(out, t.Handler.URL)
		}
	}
	for _, s := range subscriptionsOf(m) {
		if s.Handler.Type == "webhook" && s.Handler.URL != "" {
			out = append(out, s.Handler.URL)
		}
	}
	return out
}

// scanGo greps the backend/ directory for mux.HandleFunc("<method> <path>", ...)
// registrations and ensures every webhook handler path declared in the
// manifest is served. When no backend/ exists the scan is skipped — some
// addons are frontend-only or run their handlers as wasm.
var goHandleFuncRe = regexp.MustCompile(`HandleFunc\s*\(\s*"(?:[A-Z]+\s+)?([^"]+)"`)

func scanGo(srcDir string, m *v3.Manifest, r *gateResult) {
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
		for _, mm := range goHandleFuncRe.FindAllSubmatch(data, -1) {
			registered[string(mm[1])] = true
		}
		return nil
	})
	for _, hookURL := range webhookURLs(m) {
		path := canonicalPath(hookURL)
		if !anyMatchesSuffix(registered, path) {
			r.errf("webhook handler points at %q but no HandleFunc for that path found under backend/", path)
		}
	}
}

func anyMatchesSuffix(registered map[string]bool, target string) bool {
	if registered[target] {
		return true
	}
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

func scanTS(srcDir string, m *v3.Manifest, r *gateResult) {
	feSrc := filepath.Join(srcDir, "frontend", "src")
	if _, err := os.Stat(feSrc); err != nil {
		return
	}
	key := m.Metadata.Key
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
			slugs[key+"."+string(match[2])] = true
			slugs[string(match[1])+"::"+string(match[2])] = true
		}
		return nil
	})
	for _, a := range actionsOf(m) {
		if a.Modal == "" {
			continue
		}
		if !slugs[a.Modal] {
			r.errf("action.modal %q declared in manifest but no registerModal/registerActionComponent found under frontend/src/", a.Modal)
		}
	}
}

// scanSQL rejects migrations that use dangerous statements a malicious publisher
// could sneak past the installer. Not bulletproof — a parser would be — but it
// closes the cheap-exfiltration vectors.
var sqlDenyRe = regexp.MustCompile(`(?i)\b(DROP\s+ROLE|ALTER\s+ROLE|CREATE\s+ROLE|GRANT\s+|REVOKE\s+|COPY\s+[^\n]*FROM\s+PROGRAM|pg_read_server_files|pg_ls_dir|\\copy\s+[^\n]*PROGRAM)\b`)

// Match only DDL that targets a schema, not the word "schema" in comments.
var sqlSchemaRe = regexp.MustCompile(`(?i)\b(?:CREATE|ALTER|DROP|SET\s+search_path\s*=)\s+SCHEMA\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)`)

func scanSQL(srcDir string, m *v3.Manifest, r *gateResult) {
	migDir := filepath.Join(srcDir, "migrations")
	entries, err := os.ReadDir(migDir)
	if err != nil {
		return
	}
	allowedSchema := "addon_" + strings.ToLower(m.Metadata.Key)
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
