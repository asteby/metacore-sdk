package main

import (
	"io"
	"os"
	"strings"
	"testing"
)

// TestCmdValidate_V3_GoldenFixtures exercises the `metacore validate` flow,
// which now runs the strict Module Contract v3 schema (v3.Validate), against
// two checked-in manifests:
//
//	testdata/validate/v3_valid    — a well-formed v3 Addon manifest.
//	testdata/validate/v3_invalid  — wrong apiVersion + a stray top-level
//	                                `backend` field the strict schema rejects
//	                                (additionalProperties:false). validate
//	                                must reject it.
//
// Keeping the manifests on disk (rather than inline) makes them easy to grep
// from a failing CI run and serves as an addon-author-facing example of the
// contract the CLI enforces.
func TestCmdValidate_V3_GoldenFixtures(t *testing.T) {
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

	t.Run("valid v3 manifest passes", func(t *testing.T) {
		suppressStdout(t)
		if err := cmdValidate([]string{"testdata/validate/v3_valid"}); err != nil {
			t.Fatalf("expected valid v3 manifest to pass, got %v", err)
		}
	})

	t.Run("invalid v3 manifest is rejected", func(t *testing.T) {
		suppressStdout(t)
		err := cmdValidate([]string{"testdata/validate/v3_invalid"})
		if err == nil {
			t.Fatal("expected validate to reject a manifest with the wrong apiVersion and a stray top-level field")
		}
		// v3.Validate surfaces the failure with a "manifest invalid" wrapper
		// from cmdValidate. We don't pin the exact schema diagnostic (it can
		// evolve), only that the CLI flags it as invalid.
		if msg := err.Error(); !strings.Contains(msg, "manifest invalid") {
			t.Fatalf("error %q should be flagged as a manifest validation failure", msg)
		}
	})
}
