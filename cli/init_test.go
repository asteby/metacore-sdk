package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// TestCmdInit_ScaffoldPassesValidate is the acceptance test for the scaffolder:
// `metacore init <key> && metacore validate <key>` must pass out of the box.
// The scaffold emits a Module Contract v3 manifest (apiVersion: asteby.com/v3)
// with one model, one wasm-backed action and a federated frontend, so the
// strict v3 schema gate enforced by cmdValidate is exercised by the default
// output.
//
// Keeping the test in-package means we can call cmdInit / cmdValidate directly
// without spawning a subprocess and re-parsing argv.
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
		APIVersion string `json:"apiVersion"`
		Kind       string `json:"kind"`
		Metadata   struct {
			Key     string `json:"key"`
			Version string `json:"version"`
		} `json:"metadata"`
		Models        []json.RawMessage `json:"models"`
		Contributions struct {
			Actions []struct {
				Key     string `json:"key"`
				Handler struct {
					Type     string `json:"type"`
					Function string `json:"function"`
				} `json:"handler"`
			} `json:"actions"`
		} `json:"contributions"`
		Frontend struct {
			Format    string `json:"format"`
			Container string `json:"container"`
		} `json:"frontend"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("parse scaffold manifest: %v", err)
	}
	if raw.APIVersion != "asteby.com/v3" {
		t.Fatalf("scaffold apiVersion = %q, want asteby.com/v3", raw.APIVersion)
	}
	if raw.Kind != "Addon" {
		t.Fatalf("scaffold kind = %q, want Addon", raw.Kind)
	}
	if raw.Metadata.Key != key {
		t.Fatalf("scaffold metadata.key = %q, want %q", raw.Metadata.Key, key)
	}
	if len(raw.Models) == 0 {
		t.Fatalf("scaffold models[] is empty")
	}
	if raw.Frontend.Format != "federation" {
		t.Fatalf("scaffold frontend.format = %q, want federation", raw.Frontend.Format)
	}
	if raw.Frontend.Container != "metacore_"+key {
		t.Fatalf("scaffold frontend.container = %q, want metacore_%s", raw.Frontend.Container, key)
	}
	found := false
	for _, a := range raw.Contributions.Actions {
		if a.Handler.Type == "wasm" {
			if a.Handler.Function == "" {
				t.Fatalf("wasm action %q has an empty handler.function", a.Key)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("scaffold contributions.actions has no entry with handler.type=wasm")
	}

	if err := cmdValidate([]string{key}); err != nil {
		t.Fatalf("cmdValidate(%q): %v", key, err)
	}
}
