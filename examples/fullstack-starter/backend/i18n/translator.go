// Package i18n implements the kernel's i18n.Translator interface for the
// starter using embedded JSON bundles. The bundles are flattened on load
// (e.g. "models.customers.table.title") so both the host metadata pipeline
// and any handler that wants to translate strings can do a flat lookup.
//
// Adding another language is one file: drop `xx.json` in `locales/`, the
// file is auto-discovered via go:embed at build time.
package i18n

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	kerneli18n "github.com/asteby/metacore-kernel/i18n"
)

//go:embed locales/*.json
var localesFS embed.FS

// Translator is the starter's bundle-backed translator. Construct via New
// — it loads every `locales/*.json` once and serves lookups in O(1).
type Translator struct {
	defaultLang string
	bundles     map[string]map[string]string // lang -> flat key -> value
}

// New loads every bundle in locales/ and returns a Translator with
// `defaultLang` as the fallback. The lang code in the filename (e.g.
// `es.json`) becomes the bundle id.
func New(defaultLang string) (*Translator, error) {
	entries, err := localesFS.ReadDir("locales")
	if err != nil {
		return nil, fmt.Errorf("read locales: %w", err)
	}
	bundles := make(map[string]map[string]string, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := localesFS.ReadFile("locales/" + e.Name())
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", e.Name(), err)
		}
		var nested map[string]any
		if err := json.Unmarshal(raw, &nested); err != nil {
			return nil, fmt.Errorf("parse %s: %w", e.Name(), err)
		}
		flat := make(map[string]string)
		flatten("", nested, flat)
		lang := strings.TrimSuffix(e.Name(), ".json")
		bundles[lang] = flat
	}
	if _, ok := bundles[defaultLang]; !ok {
		return nil, fmt.Errorf("default language %q not found in locales/", defaultLang)
	}
	return &Translator{defaultLang: defaultLang, bundles: bundles}, nil
}

// Translate satisfies kerneli18n.Translator. Falls back to the default
// language when the requested language has no bundle, then to the key
// itself when the key is missing — so missing translations surface as
// visible "models.customers.foo" instead of empty strings.
func (t *Translator) Translate(ctx context.Context, key string, _ ...any) string {
	lang := normalizeLang(kerneli18n.LanguageFromContext(ctx))
	if lang == "" {
		lang = t.defaultLang
	}
	if v, ok := t.bundles[lang][key]; ok {
		return v
	}
	// Fall back to base language ("es-MX" -> "es").
	if i := strings.IndexAny(lang, "-_"); i > 0 {
		base := lang[:i]
		if v, ok := t.bundles[base][key]; ok {
			return v
		}
	}
	if v, ok := t.bundles[t.defaultLang][key]; ok {
		return v
	}
	return key
}

// normalizeLang lower-cases the tag and trims whitespace; preserves the
// region suffix so callers can still get region-specific keys when the
// bundle has them.
func normalizeLang(lang string) string {
	return strings.ToLower(strings.TrimSpace(lang))
}

// flatten turns nested {"models":{"customers":{"name":"X"}}} into
// {"models.customers.name":"X"} in-place. Non-string leaves are skipped
// (option arrays, numbers etc. don't belong in i18n bundles).
func flatten(prefix string, in map[string]any, out map[string]string) {
	for k, v := range in {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch val := v.(type) {
		case string:
			out[key] = val
		case map[string]any:
			flatten(key, val, out)
		}
	}
}

// MustNew is the panicking helper used at boot — startup-time errors
// are unrecoverable in a server process and a panic gives a clearer
// stack than os.Exit(1).
func MustNew(defaultLang string) *Translator {
	t, err := New(defaultLang)
	if err != nil {
		panic(fmt.Errorf("starter i18n: %w", err))
	}
	return t
}

