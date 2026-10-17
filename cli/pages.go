package main

// Federated pages at packaging time (`metacore build`):
//
//   - every frontend.pages[] entry must have been measured by the Vite build
//     (frontend/dist/metacore-pages.json, written by metacorePageBudgetPlugin
//     from @asteby/metacore-starter-config/vite) and fit its budget_kb (capped
//     at v3.MaxPageBudgetKB). The hub re-measures on publish; this catches it
//     on the author's machine first.
//   - frontend.sdk is stamped with the @asteby/metacore-sdk range the frontend
//     was built against, so EvaluateCompatibility can refuse an older host.
//   - frontend.integrity is stamped with the SRI (sha384) of remoteEntry.js,
//     which the runtime verifies before Module Federation imports it.

import (
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

// pagesReportFile is the report metacorePageBudgetPlugin writes into dist/.
const pagesReportFile = "metacore-pages.json"

type pagesReport struct {
	Version int `json:"version"`
	Pages   []struct {
		Key       string  `json:"key"`
		Expose    string  `json:"expose"`
		BudgetKB  int     `json:"budget_kb"`
		GzipBytes int64   `json:"gzip_bytes"`
		Entry     *string `json:"entry"`
	} `json:"pages"`
}

// pageBudgetKB mirrors the kernel rule: 0/absent = max, otherwise capped.
func pageBudgetKB(p v3.FrontendPage) int {
	if p.BudgetKB > 0 && p.BudgetKB < v3.MaxPageBudgetKB {
		return p.BudgetKB
	}
	return v3.MaxPageBudgetKB
}

// checkPageBudgets verifies each manifest page against the build report.
func checkPageBudgets(feDist string, m *v3.Manifest) error {
	if m.Frontend == nil || len(m.Frontend.Pages) == 0 {
		return nil
	}
	raw, err := os.ReadFile(filepath.Join(feDist, pagesReportFile))
	if err != nil {
		return fmt.Errorf("build: frontend.pages[] needs %s in frontend/dist — add metacorePageBudgetPlugin({ manifest, exposes }) "+
			"from @asteby/metacore-starter-config/vite to the frontend build (%w)", pagesReportFile, err)
	}
	var rep pagesReport
	if err := json.Unmarshal(raw, &rep); err != nil {
		return fmt.Errorf("build: parse %s: %w", pagesReportFile, err)
	}
	byExpose := map[string]int{}
	for i, p := range rep.Pages {
		byExpose[p.Expose] = i
	}
	var problems []string
	for _, p := range m.Frontend.Pages {
		i, ok := byExpose[p.Expose]
		if !ok || rep.Pages[i].Entry == nil {
			problems = append(problems, fmt.Sprintf("page %q: expose %q was not built (missing from %s)", p.Key, p.Expose, pagesReportFile))
			continue
		}
		budget := pageBudgetKB(p)
		if got := rep.Pages[i].GzipBytes; got > int64(budget)*1024 {
			problems = append(problems, fmt.Sprintf("page %q (%s): %.1f KB gzip exceeds budget %d KB", p.Key, p.Expose, float64(got)/1024, budget))
		}
	}
	if len(problems) > 0 {
		return fmt.Errorf("build: page budget:\n  %s", strings.Join(problems, "\n  "))
	}
	return nil
}

// sdkRangeFor returns the @asteby/metacore-sdk range the frontend was built
// against: "^<major>.<minor>.0" of the installed copy, else the declared range
// (peerDependencies first). Empty when the frontend does not use the SDK.
func sdkRangeFor(frontendDir string) string {
	if raw, err := os.ReadFile(filepath.Join(frontendDir, "node_modules", "@asteby", "metacore-sdk", "package.json")); err == nil {
		var pkg struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(raw, &pkg) == nil {
			if m := regexp.MustCompile(`^(\d+)\.(\d+)\.`).FindStringSubmatch(pkg.Version); m != nil {
				return fmt.Sprintf("^%s.%s.0", m[1], m[2])
			}
		}
	}
	raw, err := os.ReadFile(filepath.Join(frontendDir, "package.json"))
	if err != nil {
		return ""
	}
	var pkg map[string]map[string]string
	_ = json.Unmarshal(raw, &pkg)
	for _, field := range []string{"peerDependencies", "dependencies", "devDependencies"} {
		if r := strings.TrimSpace(pkg[field]["@asteby/metacore-sdk"]); r != "" && !strings.HasPrefix(r, "workspace:") {
			return r
		}
	}
	return ""
}

// sriSHA384 is the Subresource Integrity string of data.
func sriSHA384(data []byte) string {
	sum := sha512.Sum384(data)
	return "sha384-" + base64.StdEncoding.EncodeToString(sum[:])
}

// stampFrontend writes frontend.sdk (when absent) and frontend.integrity (the
// SRI of the built remote entry) into the raw manifest. Returns the new bytes
// and what changed; the caller re-validates. Unchanged input → same bytes.
func stampFrontend(raw []byte, srcDir string, m *v3.Manifest, frontendFiles map[string][]byte) ([]byte, []string, error) {
	if m.Frontend == nil || m.Frontend.Format != "federation" {
		return raw, nil, nil
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, nil, err
	}
	var fe map[string]json.RawMessage
	if err := json.Unmarshal(doc["frontend"], &fe); err != nil {
		return nil, nil, err
	}
	var notes []string
	if m.Frontend.SDK == "" {
		if r := sdkRangeFor(filepath.Join(srcDir, "frontend")); r != "" {
			fe["sdk"], _ = json.Marshal(r)
			notes = append(notes, "frontend.sdk="+r)
		}
	}
	entryName := path.Base(m.Frontend.Entry)
	if entryName == "" || entryName == "." || entryName == "/" {
		entryName = "remoteEntry.js"
	}
	if data, ok := frontendFiles["frontend/"+entryName]; ok {
		sri := sriSHA384(data)
		if sri != m.Frontend.Integrity {
			fe["integrity"], _ = json.Marshal(sri)
			notes = append(notes, "frontend.integrity="+sri[:15]+"…")
		}
	}
	if len(notes) == 0 {
		return raw, nil, nil
	}
	feRaw, err := json.Marshal(fe)
	if err != nil {
		return nil, nil, err
	}
	doc["frontend"] = feRaw
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, nil, err
	}
	return append(out, '\n'), notes, nil
}
