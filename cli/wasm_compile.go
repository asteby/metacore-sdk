package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// cmdCompileWASM is a thin wrapper over `tinygo build -target=wasi` so the
// common case of compiling an addon's ./backend/ tree into
// backend/backend.wasm is one command. Addons with non-standard layouts can
// run tinygo directly.
func cmdCompileWASM(args []string) error {
	fs := flag.NewFlagSet("compile-wasm", flag.ExitOnError)
	out := fs.String("o", "backend/backend.wasm", "output .wasm path, relative to srcDir")
	pkg := fs.String("pkg", "./backend/", "Go package to compile (relative to srcDir)")
	_ = fs.Parse(args)
	srcDir := "."
	if fs.NArg() > 0 {
		srcDir = fs.Arg(0)
	}

	tinygo, err := exec.LookPath("tinygo")
	if err != nil {
		return fmt.Errorf("compile-wasm: tinygo not found on PATH.\n  Install: https://tinygo.org/getting-started/install/")
	}

	// Ensure output directory exists.
	outPath := filepath.Join(srcDir, *out)
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return fmt.Errorf("compile-wasm: mkdir %s: %w", filepath.Dir(outPath), err)
	}

	cmd := exec.Command(tinygo, "build", "-target=wasi", "-scheduler=none", "-o", *out, *pkg)
	cmd.Dir = srcDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Fprintf(os.Stderr, "compile-wasm: %s build -target=wasi -scheduler=none -o %s %s (cwd=%s)\n", tinygo, *out, *pkg, srcDir)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("compile-wasm: tinygo build failed: %w", err)
	}
	fmt.Printf("compile-wasm: wrote %s\n", outPath)
	return nil
}
