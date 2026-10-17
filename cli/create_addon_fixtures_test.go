package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asteby/metacore-kernel/manifest"
	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

// TestCreateAddonOutputsPassKernelValidation validates, with the pinned
// kernel, what the JS scaffolder generates: the golden manifests of
// `create-metacore-addon add view` (one per view type) and the rendered
// `embedded-page` template. The node tests keep the goldens equal to the
// generator output; this keeps them equal to what the kernel accepts. It also
// checks the host capabilities the kernel infers from them.
func TestCreateAddonOutputsPassKernelValidation(t *testing.T) {
	root := filepath.Join("..", "packages", "create-addon", "test", "fixtures")
	files, err := filepath.Glob(filepath.Join(root, "views", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	files = append(files, filepath.Join(root, "embedded-page.manifest.json"))
	if len(files) < 7 {
		t.Fatalf("expected the base, 6 view goldens and the embedded-page manifest, got %v", files)
	}

	wantCaps := map[string][]string{
		"map.json":                    {"ui.views.map"},
		"timeline.json":               {"ui.views.timeline"},
		"calendar.json":               {"ui.views.calendar"},
		"chart.json":                  {"ui.views.chart"},
		"chart-line-sum.json":         {"ui.views.chart"},
		"split.json":                  {"ui.views.split"},
		"embedded-page.manifest.json": {"ui.pages", "ui.embedded_pages", "ui.views.split", "ui.detail_panels"},
	}
	for _, f := range files {
		name := filepath.Base(f)
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			if err := v3.Validate(raw); err != nil {
				t.Fatalf("kernel rejects %s: %v", name, err)
			}
			mv3, err := v3.Parse(raw)
			if err != nil {
				t.Fatal(err)
			}
			legacy := manifest.FromV3(mv3)
			if err := legacy.Validate("3.0.0"); err != nil {
				t.Fatalf("legacy carrier rejects %s: %v", name, err)
			}
			have := map[string]bool{}
			for _, c := range legacy.RequiredHostCapabilities() {
				have[c] = true
			}
			for _, c := range wantCaps[name] {
				if !have[c] {
					t.Fatalf("%s: kernel should infer host capability %q, inferred %v", name, c, keys(have))
				}
			}
		})
	}
}

func keys(m map[string]bool) string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return strings.Join(out, ",")
}
