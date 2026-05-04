package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// TestCmdInit_ScaffoldPassesValidate is the literal acceptance test the night
// task asked for: `metacore init <key> && metacore validate <key>` must pass
// out of the box. The scaffold ships a Backend (runtime=wasm) plus one
// ActionDef whose Trigger.Type=wasm references an entry in backend.exports —
// so the cross-check enforced by both the kernel manifest validator and the
// CLI's own validateActionTriggerExports is exercised by the default output.
//
// Keeping the test in-package means we can call cmdInit / cmdValidate
// directly without spawning a subprocess and re-parsing argv.
func TestCmdInit_ScaffoldPassesValidate(t *testing.T) {
	dir := t.TempDir()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir tempdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(cwd) })

	// cmdInit / cmdValidate write to stdout; mute it so test output stays
	// clean. Restored by t.Cleanup so subsequent tests are unaffected.
	origStdout := os.Stdout
	devnull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		r, w, perr := os.Pipe()
		if perr != nil {
			t.Fatalf("pipe: %v", perr)
		}
		os.Stdout = w
		t.Cleanup(func() {
			_ = w.Close()
			_, _ = io.Copy(io.Discard, r)
			_ = r.Close()
			os.Stdout = origStdout
		})
	} else {
		os.Stdout = devnull
		t.Cleanup(func() {
			_ = devnull.Close()
			os.Stdout = origStdout
		})
	}

	const key = "demo"
	if err := cmdInit([]string{key}); err != nil {
		t.Fatalf("cmdInit(%q): %v", key, err)
	}

	manifestPath := filepath.Join(key, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read scaffold manifest: %v", err)
	}
	var raw struct {
		Backend struct {
			Runtime string   `json:"runtime"`
			Entry   string   `json:"entry"`
			Exports []string `json:"exports"`
		} `json:"backend"`
		Actions map[string][]struct {
			Key     string `json:"key"`
			Trigger *struct {
				Type   string `json:"type"`
				Export string `json:"export"`
			} `json:"trigger"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("parse scaffold manifest: %v", err)
	}
	if raw.Backend.Runtime != "wasm" {
		t.Fatalf("scaffold backend.runtime = %q, want wasm", raw.Backend.Runtime)
	}
	if len(raw.Backend.Exports) == 0 {
		t.Fatalf("scaffold backend.exports is empty")
	}
	exportSet := make(map[string]struct{}, len(raw.Backend.Exports))
	for _, e := range raw.Backend.Exports {
		exportSet[e] = struct{}{}
	}
	model := key + "_items"
	defs := raw.Actions[model]
	if len(defs) == 0 {
		t.Fatalf("scaffold actions[%q] has no entries", model)
	}
	found := false
	for _, a := range defs {
		if a.Trigger != nil && a.Trigger.Type == "wasm" {
			if _, ok := exportSet[a.Trigger.Export]; !ok {
				t.Fatalf("trigger.export %q on action %q not declared in backend.exports %v", a.Trigger.Export, a.Key, raw.Backend.Exports)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("scaffold actions[%q] has no entry with trigger.type=wasm", model)
	}

	if err := cmdValidate([]string{key}); err != nil {
		t.Fatalf("cmdValidate(%q): %v", key, err)
	}
}
