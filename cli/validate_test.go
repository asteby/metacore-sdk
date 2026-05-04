package main

import (
	"io"
	"os"
	"strings"
	"testing"
)

// TestCmdValidate_WasmTriggerExport_GoldenFixtures exercises the
// `metacore validate` flow against two checked-in manifests:
//
//	testdata/validate/wasm_trigger_valid    — every ActionDef.Trigger.Export
//	                                          (Type=wasm) is listed in
//	                                          BackendSpec.Exports.
//	testdata/validate/wasm_trigger_invalid  — one trigger references an
//	                                          export the backend never
//	                                          declared; validate must reject it.
//
// Keeping the manifests on disk (rather than inline) makes them easy to grep
// from a failing CI run and serves as an addon-author-facing example of the
// contract the CLI enforces.
func TestCmdValidate_WasmTriggerExport_GoldenFixtures(t *testing.T) {
	// cmdValidate writes a success line to stdout; redirect it so test output
	// stays clean. Restored on every iteration via the cleanup func.
	suppressStdout := func(t *testing.T) {
		t.Helper()
		orig := os.Stdout
		devnull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
		if err != nil {
			// Fall back to a discarded pipe if /dev/null is unavailable.
			r, w, perr := os.Pipe()
			if perr != nil {
				t.Fatalf("pipe: %v", perr)
			}
			os.Stdout = w
			t.Cleanup(func() {
				_ = w.Close()
				_, _ = io.Copy(io.Discard, r)
				_ = r.Close()
				os.Stdout = orig
			})
			return
		}
		os.Stdout = devnull
		t.Cleanup(func() {
			_ = devnull.Close()
			os.Stdout = orig
		})
	}

	t.Run("valid manifest passes", func(t *testing.T) {
		suppressStdout(t)
		if err := cmdValidate([]string{"testdata/validate/wasm_trigger_valid"}); err != nil {
			t.Fatalf("expected valid manifest to pass, got %v", err)
		}
	})

	t.Run("missing export is rejected", func(t *testing.T) {
		suppressStdout(t)
		err := cmdValidate([]string{"testdata/validate/wasm_trigger_invalid"})
		if err == nil {
			t.Fatal("expected validate to reject a wasm trigger whose export is not in backend.exports")
		}
		// The kernel manifest validator surfaces this as
		// `trigger.export: "X" not declared in backend.exports`. Assert the
		// stable substrings — the exact prefix path may evolve, but the
		// `backend.exports` clause is the contract the CLI must surface so
		// addon authors know what to fix.
		msg := err.Error()
		if !strings.Contains(msg, "backend.exports") {
			t.Fatalf("error %q should mention backend.exports", msg)
		}
		if !strings.Contains(msg, "EscalateTicket") {
			t.Fatalf("error %q should name the offending export EscalateTicket", msg)
		}
	})
}
