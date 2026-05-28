// Command metacore is the addon developer CLI.
//
// Usage:
//
//	metacore init <key>           scaffold a new addon directory (Module Contract v3)
//	metacore validate [path]      validate manifest.json in path (default ".")
//	metacore build [path]         pack a bundle into <key>-<version>.tar.gz
//	metacore inspect <bundle>     print manifest + migrations + frontend size
//
// The CLI validates and emits Module Contract v3 manifests
// (`apiVersion: "asteby.com/v3"`). It uses the strict v3 parser from
// github.com/asteby/metacore-kernel/manifest/v3 so addon authors hit the same
// schema the kernel installer enforces. The kernel still dual-reads v2 for
// backwards compatibility, but the SDK toolchain emits v3 only.
package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"encoding/json"
	"flag"

	"github.com/asteby/metacore-kernel/bundle"
	"github.com/asteby/metacore-kernel/dynamic"
	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

func main() {
	if len(os.Args) < 2 {
		usage(os.Stderr)
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]
	var err error
	switch cmd {
	case "init":
		err = cmdInit(args)
	case "validate":
		err = cmdValidate(args)
	case "build":
		err = cmdBuild(args)
	case "inspect":
		err = cmdInspect(args)
	case "keygen":
		err = cmdKeygen(args)
	case "sign":
		err = cmdSign(args)
	case "compile-wasm":
		err = cmdCompileWASM(args)
	case "help", "-h", "--help":
		usage(os.Stdout)
		return
	default:
		fmt.Fprintf(os.Stderr, "metacore: unknown command %q\n\n", cmd)
		usage(os.Stderr)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "metacore: %v\n", err)
		os.Exit(1)
	}
}

func usage(w io.Writer) {
	fmt.Fprint(w, `metacore — addon developer CLI (Module Contract v3)

Commands:
  init <key>               scaffold a new addon directory (emits apiVersion: asteby.com/v3)
  validate [path]          validate manifest.json in path (default ".") against the v3 schema
  build   [path] [--strict] [--sign <pem>] [--target webhook|wasm]
                           run gates then pack bundle into <key>-<version>.tar.gz
                           --target defaults to wasm when a backend/ tree is present, else webhook
  compile-wasm [path]      wrapper around tinygo to produce backend/backend.wasm
  inspect <bundle>         print manifest + migrations + frontend size
  keygen --out <prefix>    generate an Ed25519 dev keypair for sign
  sign --key <pem> <file>  produce <file>.sig (Ed25519 over SHA-256)
`)
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

func cmdValidate(args []string) error {
	fs := flag.NewFlagSet("validate", flag.ExitOnError)
	_ = fs.Parse(args)
	path := "."
	if fs.NArg() > 0 {
		path = fs.Arg(0)
	}
	raw, m, err := readManifest(path)
	if err != nil {
		return err
	}
	if err := v3.Validate(raw); err != nil {
		return fmt.Errorf("manifest invalid: %w", err)
	}
	fmt.Printf("ok: %s@%s passes validation against the v3 contract (%s)\n", m.Metadata.Key, m.Metadata.Version, v3.APIVersion)
	return nil
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

func cmdBuild(args []string) error {
	fs := flag.NewFlagSet("build", flag.ExitOnError)
	out := fs.String("o", "", "output file (default <key>-<version>.tar.gz)")
	signKey := fs.String("sign", "", "Ed25519 PEM key — sign the built bundle")
	strict := fs.Bool("strict", false, "treat warnings as errors")
	target := fs.String("target", "", "backend target: webhook|wasm (default: wasm when backend/ exists, else webhook)")
	_ = fs.Parse(args)
	srcDir := "."
	if fs.NArg() > 0 {
		srcDir = fs.Arg(0)
	}
	raw, m, err := readManifest(srcDir)
	if err != nil {
		return err
	}
	if err := v3.Validate(raw); err != nil {
		return fmt.Errorf("manifest invalid: %w", err)
	}
	if err := runGates(srcDir, m, *strict); err != nil {
		return err
	}

	// Resolve --target: explicit flag wins, else infer from the presence of a
	// backend/ tree (v3 drops the contract-level backend block — runtime
	// selection is a bundle concern now), else webhook.
	resolvedTarget := *target
	if resolvedTarget == "" {
		if _, statErr := os.Stat(filepath.Join(srcDir, "backend")); statErr == nil {
			resolvedTarget = "wasm"
		} else {
			resolvedTarget = "webhook"
		}
	}
	switch resolvedTarget {
	case "webhook", "wasm":
	default:
		return fmt.Errorf("build: unknown --target %q (want webhook|wasm)", resolvedTarget)
	}

	// The v3 manifest is written verbatim so the original contract document —
	// including kind:Preset/Theme blocks the legacy bundle.Manifest cannot hold
	// — survives in the bundle. We carry it through bundle.Bundle.RawManifest;
	// bundle.Write emits the legacy Manifest as manifest.json, so for v3 we pack
	// the archive ourselves (writeBundleV3) to keep the raw v3 bytes as the
	// canonical manifest.json the kernel installer dual-reads.
	b := &bundle.Bundle{Frontend: map[string][]byte{}, Backend: map[string][]byte{}, RawManifest: raw}

	// backend/backend.wasm when target=wasm
	if resolvedTarget == "wasm" {
		entry := "backend/backend.wasm"
		wasmPath := filepath.Join(srcDir, entry)
		data, err := os.ReadFile(wasmPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("build: %s not found — run `metacore compile-wasm %s` first", entry, srcDir)
			}
			return fmt.Errorf("build: read %s: %w", entry, err)
		}
		b.Backend["backend/backend.wasm"] = data
	}

	// migrations/*.sql
	migDir := filepath.Join(srcDir, "migrations")
	if entries, err := os.ReadDir(migDir); err == nil {
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(migDir, e.Name()))
			if err != nil {
				return err
			}
			b.Migrations = append(b.Migrations, dynamic.File{
				Version: strings.TrimSuffix(e.Name(), ".sql"),
				SQL:     string(data),
			})
		}
		sort.Slice(b.Migrations, func(i, j int) bool { return b.Migrations[i].Version < b.Migrations[j].Version })
	}

	// frontend — prefer the built artifacts under frontend/dist/ so the bundle
	// carries the federation remote (remoteEntry.js + assets/*) rather than the
	// raw TS/TSX sources. When dist/ is absent but src/ exists we emit a warning
	// and skip — the addon author forgot to run the frontend build step.
	feDist := filepath.Join(srcDir, "frontend", "dist")
	feSrc := filepath.Join(srcDir, "frontend", "src")
	if _, err := os.Stat(feDist); err == nil {
		err := filepath.Walk(feDist, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(feDist, p)
			if err != nil {
				return err
			}
			rel = filepath.ToSlash(rel)
			data, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			b.Frontend["frontend/"+rel] = data
			return nil
		})
		if err != nil {
			return err
		}
	} else if _, err := os.Stat(feSrc); err == nil {
		fmt.Fprintf(os.Stderr, "metacore: warning: %s exists but %s does not — skipping frontend. Run `./frontend/build.sh` first.\n", feSrc, feDist)
	}

	// README.md
	if data, err := os.ReadFile(filepath.Join(srcDir, "README.md")); err == nil {
		b.Readme = string(data)
	}

	outName := *out
	if outName == "" {
		outName = fmt.Sprintf("%s-%s.tar.gz", m.Metadata.Key, m.Metadata.Version)
	}
	f, err := os.Create(outName)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := writeBundleV3(f, b); err != nil {
		return err
	}
	fmt.Printf("built %s (%d migrations, %d frontend files, %d backend files, target=%s)\n", outName, len(b.Migrations), len(b.Frontend), len(b.Backend), resolvedTarget)
	if *signKey != "" {
		if err := cmdSign([]string{"--key", *signKey, outName}); err != nil {
			return fmt.Errorf("sign: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// inspect
// ---------------------------------------------------------------------------

func cmdInspect(args []string) error {
	fs := flag.NewFlagSet("inspect", flag.ExitOnError)
	_ = fs.Parse(args)
	if fs.NArg() < 1 {
		return fmt.Errorf("inspect: missing bundle path")
	}
	f, err := os.Open(fs.Arg(0))
	if err != nil {
		return err
	}
	defer f.Close()
	b, err := bundle.Read(f, 0)
	if err != nil {
		return err
	}
	fmt.Printf("Bundle: %s\n", fs.Arg(0))
	// Prefer the verbatim v3 document when present (kind, compatibility range,
	// model count) so inspect reports what the author actually shipped rather
	// than the legacy FromV3 projection.
	if mv3, perr := v3.Parse(b.RawManifest); perr == nil {
		kernelRange := ""
		for _, r := range mv3.Compatibility.Requires {
			if r.Key == "kernel" {
				kernelRange = r.Version
				break
			}
		}
		fmt.Printf("  apiVersion:  %s\n", mv3.APIVersion)
		fmt.Printf("  kind:        %s\n", mv3.Kind)
		fmt.Printf("  key:         %s\n", mv3.Metadata.Key)
		fmt.Printf("  name:        %s\n", mv3.Metadata.Name)
		fmt.Printf("  version:     %s\n", mv3.Metadata.Version)
		fmt.Printf("  kernel:      %s\n", kernelRange)
		fmt.Printf("  models:      %d\n", len(mv3.Models))
		fmt.Printf("  capabilities:%d\n", len(mv3.Capabilities))
	} else {
		// Legacy v2 bundle (or a v3 doc the parser couldn't round-trip): fall
		// back to the dual-read legacy projection.
		fmt.Printf("  key:         %s\n", b.Manifest.Key)
		fmt.Printf("  name:        %s\n", b.Manifest.Name)
		fmt.Printf("  version:     %s\n", b.Manifest.Version)
		fmt.Printf("  kernel:      %s\n", b.Manifest.Kernel)
		fmt.Printf("  models:      %d\n", len(b.Manifest.ModelDefinitions))
		fmt.Printf("  capabilities:%d\n", len(b.Manifest.Capabilities))
	}
	fmt.Printf("  raw size:    %d bytes\n", b.RawSize)
	fmt.Printf("  migrations (%d):\n", len(b.Migrations))
	for _, m := range b.Migrations {
		fmt.Printf("    - %s (%d bytes)\n", m.Version, len(m.SQL))
	}
	var feSize int
	feKeys := make([]string, 0, len(b.Frontend))
	for k, v := range b.Frontend {
		feSize += len(v)
		feKeys = append(feKeys, k)
	}
	sort.Strings(feKeys)
	fmt.Printf("  frontend (%d files, %d bytes):\n", len(feKeys), feSize)
	for _, k := range feKeys {
		fmt.Printf("    - %s (%d bytes)\n", k, len(b.Frontend[k]))
	}
	if b.Readme != "" {
		fmt.Printf("  readme:      %d bytes\n", len(b.Readme))
	}
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// readManifest reads <dir>/manifest.json and returns both the verbatim bytes
// (for v3.Validate / verbatim bundle packing) and the typed v3 manifest. The
// typed decode is permissive — full schema enforcement is v3.Validate's job —
// so callers that only need the key/version (build/validate banners) get them
// even before the strict pass runs.
func readManifest(dir string) ([]byte, *v3.Manifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, nil, fmt.Errorf("read manifest: %w", err)
	}
	var m v3.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, nil, fmt.Errorf("parse manifest: %w", err)
	}
	return data, &m, nil
}
