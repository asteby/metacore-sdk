package main

import (
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/asteby/metacore-kernel/bundle"
	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

// kernelExample returns the kernel's own UI example manifest (shipping: pages,
// declarative views, detail panels) from the module cache, so these tests run
// against exactly the grammar the pinned kernel validates.
func kernelExample(t *testing.T) []byte {
	t.Helper()
	out, err := exec.Command("go", "list", "-m", "-f", "{{.Dir}}", "github.com/asteby/metacore-kernel").Output()
	if err != nil {
		t.Skipf("kernel module dir: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(strings.TrimSpace(string(out)), "docs", "spec", "v3", "examples", "addon-ui-example.json"))
	if err != nil {
		t.Fatalf("read kernel example: %v", err)
	}
	if err := v3.Validate(raw); err != nil {
		t.Fatalf("kernel example must validate: %v", err)
	}
	return raw
}

func writeJSON(t *testing.T, p string, v any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(v)
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func report(gzip int64, entry any) map[string]any {
	return map[string]any{"version": 1, "pages": []map[string]any{{
		"key": "control_tower", "expose": "./pages/control-tower", "budget_kb": 120, "gzip_bytes": gzip, "entry": entry,
	}}}
}

func TestCheckPageBudgets(t *testing.T) {
	raw := kernelExample(t)
	m, err := v3.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	dist := t.TempDir()

	if err := checkPageBudgets(dist, m); err == nil || !strings.Contains(err.Error(), "metacorePageBudgetPlugin") {
		t.Fatalf("missing report must explain the plugin, got %v", err)
	}

	writeJSON(t, filepath.Join(dist, pagesReportFile), report(100*1024, "assets/control-tower.js"))
	if err := checkPageBudgets(dist, m); err != nil {
		t.Fatalf("100 KB within the 120 KB budget: %v", err)
	}

	writeJSON(t, filepath.Join(dist, pagesReportFile), report(121*1024, "assets/control-tower.js"))
	if err := checkPageBudgets(dist, m); err == nil || !strings.Contains(err.Error(), "exceeds budget 120 KB") {
		t.Fatalf("over budget must fail, got %v", err)
	}

	writeJSON(t, filepath.Join(dist, pagesReportFile), report(10, nil))
	if err := checkPageBudgets(dist, m); err == nil || !strings.Contains(err.Error(), "was not built") {
		t.Fatalf("unbuilt expose must fail, got %v", err)
	}
}

func TestPageBudgetKBCap(t *testing.T) {
	cases := map[int]int{0: 150, 120: 120, 150: 150, 999: 150}
	for in, want := range cases {
		if got := pageBudgetKB(v3.FrontendPage{BudgetKB: in}); got != want {
			t.Fatalf("budget %d → %d, want %d", in, got, want)
		}
	}
}

func TestStampFrontend(t *testing.T) {
	raw := kernelExample(t)
	// Drop the example's sdk so the stamp has something to write.
	var doc map[string]any
	_ = json.Unmarshal(raw, &doc)
	delete(doc["frontend"].(map[string]any), "sdk")
	raw, _ = json.Marshal(doc)
	m, err := v3.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}

	src := t.TempDir()
	writeJSON(t, filepath.Join(src, "frontend", "node_modules", "@asteby", "metacore-sdk", "package.json"), map[string]string{"version": "3.15.2"})
	entry := []byte("export const init = () => {}\n")
	files := map[string][]byte{"frontend/remoteEntry.js": entry}

	out, notes, err := stampFrontend(raw, src, m, files)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 2 {
		t.Fatalf("want sdk + integrity notes, got %v", notes)
	}
	if err := v3.Validate(out); err != nil {
		t.Fatalf("stamped manifest must still validate: %v", err)
	}
	stamped, _ := v3.Parse(out)
	if stamped.Frontend.SDK != "^3.15.0" {
		t.Fatalf("sdk = %q", stamped.Frontend.SDK)
	}
	sum := sha512.Sum384(entry)
	if want := "sha384-" + base64.StdEncoding.EncodeToString(sum[:]); stamped.Frontend.Integrity != want {
		t.Fatalf("integrity = %q, want %q", stamped.Frontend.Integrity, want)
	}
	if len(stamped.Frontend.Pages) != 1 || stamped.Frontend.Pages[0].Key != "control_tower" {
		t.Fatalf("pages must survive the stamp: %+v", stamped.Frontend.Pages)
	}

	// Idempotent: stamping the stamped manifest changes nothing.
	again, notes2, err := stampFrontend(out, src, stamped, files)
	if err != nil || len(notes2) != 0 || string(again) != string(out) {
		t.Fatalf("second stamp should be a no-op: notes=%v err=%v", notes2, err)
	}
}

func TestSDKRangeFallsBackToDeclaredRange(t *testing.T) {
	src := t.TempDir()
	writeJSON(t, filepath.Join(src, "package.json"), map[string]any{
		"peerDependencies": map[string]string{"@asteby/metacore-sdk": "^3.14.0"},
		"devDependencies":  map[string]string{"@asteby/metacore-sdk": "workspace:*"},
	})
	if got := sdkRangeFor(src); got != "^3.14.0" {
		t.Fatalf("got %q", got)
	}
	if got := sdkRangeFor(t.TempDir()); got != "" {
		t.Fatalf("no frontend → empty, got %q", got)
	}
}

// TestCmdBuild_PagesStampAndBudget packs the kernel example end to end: the
// bundle's manifest carries frontend.sdk and frontend.integrity, and an
// over-budget page stops the build.
func TestCmdBuild_PagesStampAndBudget(t *testing.T) {
	raw := kernelExample(t)
	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	dist := filepath.Join(src, "frontend", "dist")
	if err := os.MkdirAll(filepath.Join(dist, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dist, "remoteEntry.js"), []byte("export {}\n"), 0o644)
	_ = os.WriteFile(filepath.Join(dist, "assets", "control-tower.js"), []byte("export default 1\n"), 0o644)
	writeJSON(t, filepath.Join(dist, pagesReportFile), report(40*1024, "assets/control-tower.js"))

	out := filepath.Join(t.TempDir(), "shipping.tar.gz")
	silence(t)
	if err := cmdBuild([]string{"-o", out, "--target", "webhook", src}); err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	b, err := bundle.Read(f, 0)
	if err != nil {
		t.Fatal(err)
	}
	packed, err := v3.Parse(b.RawManifest)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(packed.Frontend.Integrity, "sha384-") {
		t.Fatalf("integrity not stamped: %q", packed.Frontend.Integrity)
	}
	if packed.Frontend.SDK != "^4.0.0" {
		t.Fatalf("an explicit frontend.sdk is kept, got %q", packed.Frontend.SDK)
	}

	writeJSON(t, filepath.Join(dist, pagesReportFile), report(200*1024, "assets/control-tower.js"))
	if err := cmdBuild([]string{"-o", out, "--target", "webhook", src}); err == nil || !strings.Contains(err.Error(), "page budget") {
		t.Fatalf("over-budget page must stop the build, got %v", err)
	}
}

func silence(t *testing.T) {
	t.Helper()
	orig := os.Stdout
	devnull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		return
	}
	os.Stdout = devnull
	t.Cleanup(func() {
		_ = devnull.Close()
		os.Stdout = orig
	})
}

// TestPageSharesMatchKernel guards the TypeScript copies of the kernel's
// closed share set (v3.PageShares) and budget ceiling against drift.
func TestPageSharesMatchKernel(t *testing.T) {
	want := make([]string, 0, len(v3.PageShares))
	for k := range v3.PageShares {
		want = append(want, k)
	}
	sort.Strings(want)
	quoted := regexp.MustCompile(`['"](@asteby/metacore-maps|maplibre-gl|@asteby/metacore-charts|recharts|[@a-z0-9/._-]+)['"]`)
	for _, file := range []string{
		"../packages/starter-config/federation-pages.js",
		"../packages/sdk/src/page.ts",
	} {
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		block := string(src)
		start := strings.Index(block, "PAGE_SHARES")
		if start < 0 {
			t.Fatalf("%s: no PAGE_SHARES", file)
		}
		block = block[start:]
		end := strings.Index(block, ")")
		if alt := strings.Index(block, "} as const"); alt >= 0 && (end < 0 || alt < end) {
			end = alt
		}
		if end < 0 {
			t.Fatalf("%s: unterminated PAGE_SHARES", file)
		}
		got := map[string]bool{}
		for _, m := range quoted.FindAllStringSubmatch(block[:end], -1) {
			if strings.HasPrefix(m[1], "ui.") {
				continue
			}
			got[m[1]] = true
		}
		// The page.ts object form also lists the unquoted key `recharts`.
		if strings.Contains(block[:end], "recharts:") {
			got["recharts"] = true
		}
		keys := make([]string, 0, len(got))
		for k := range got {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		if strings.Join(keys, ",") != strings.Join(want, ",") {
			t.Fatalf("%s PAGE_SHARES = %v, kernel v3.PageShares = %v", file, keys, want)
		}
	}
	js, _ := os.ReadFile("../packages/starter-config/federation-pages.js")
	if !regexp.MustCompile(`METACORE_PAGE_MAX_BUDGET_KB = 150\b`).Match(js) || v3.MaxPageBudgetKB != 150 {
		t.Fatalf("METACORE_PAGE_MAX_BUDGET_KB must equal v3.MaxPageBudgetKB (%d)", v3.MaxPageBudgetKB)
	}
}
