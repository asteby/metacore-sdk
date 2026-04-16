// Command metacore is the addon developer CLI.
//
// Usage:
//
//	metacore init <key>           scaffold a new addon directory
//	metacore validate [path]      validate manifest.json in path (default ".")
//	metacore build [path]         pack a bundle into <key>-<version>.tar.gz
//	metacore inspect <bundle>     print manifest + migrations + frontend size
//
// The CLI is stdlib-only and uses the SDK packages under
// github.com/asteby/metacore-sdk/pkg/*.
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

	"github.com/asteby/metacore-sdk/pkg/bundle"
	"github.com/asteby/metacore-sdk/pkg/dynamic"
	"github.com/asteby/metacore-sdk/pkg/manifest"
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
	fmt.Fprint(w, `metacore — addon developer CLI

Commands:
  init <key>               scaffold a new addon directory
  validate [path]          validate manifest.json in path (default ".")
  build   [path] [--strict] [--sign <pem>] [--target webhook|wasm]
                           run gates then pack bundle into <key>-<version>.tar.gz
                           --target defaults to manifest.backend.runtime (webhook)
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
	m, err := readManifest(path)
	if err != nil {
		return err
	}
	if err := m.Validate(manifest.APIVersion); err != nil {
		return fmt.Errorf("manifest invalid: %w", err)
	}
	fmt.Printf("ok: %s@%s passes validation against kernel %s\n", m.Key, m.Version, manifest.APIVersion)
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
	target := fs.String("target", "", "backend target: webhook|wasm (default: manifest.backend.runtime or webhook)")
	_ = fs.Parse(args)
	srcDir := "."
	if fs.NArg() > 0 {
		srcDir = fs.Arg(0)
	}
	m, err := readManifest(srcDir)
	if err != nil {
		return err
	}
	if err := m.Validate(manifest.APIVersion); err != nil {
		return fmt.Errorf("manifest invalid: %w", err)
	}
	if err := runGates(srcDir, m, *strict); err != nil {
		return err
	}

	// Resolve --target: explicit flag wins, else manifest.backend.runtime, else webhook.
	resolvedTarget := *target
	if resolvedTarget == "" {
		if m.Backend != nil && m.Backend.Runtime != "" {
			resolvedTarget = m.Backend.Runtime
		} else {
			resolvedTarget = "webhook"
		}
	}
	switch resolvedTarget {
	case "webhook", "wasm":
	default:
		return fmt.Errorf("build: unknown --target %q (want webhook|wasm)", resolvedTarget)
	}

	b := &bundle.Bundle{Manifest: *m, Frontend: map[string][]byte{}, Backend: map[string][]byte{}}

	// backend/backend.wasm when target=wasm
	if resolvedTarget == "wasm" {
		entry := "backend/backend.wasm"
		if m.Backend != nil && m.Backend.Entry != "" {
			entry = m.Backend.Entry
		}
		wasmPath := filepath.Join(srcDir, entry)
		data, err := os.ReadFile(wasmPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("build: %s not found — run `metacore compile-wasm %s` first", entry, srcDir)
			}
			return fmt.Errorf("build: read %s: %w", entry, err)
		}
		// Normalize the bundle key to forward slashes + "backend/" root.
		key := filepath.ToSlash(entry)
		if !strings.HasPrefix(key, "backend/") {
			key = "backend/" + key
		}
		b.Backend[key] = data
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
			// Normalize to forward slashes and re-root under "frontend/" so the
			// installer can materialize it flat on disk.
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
		outName = fmt.Sprintf("%s-%s.tar.gz", m.Key, m.Version)
	}
	f, err := os.Create(outName)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := bundle.Write(f, b); err != nil {
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
	fmt.Printf("  key:         %s\n", b.Manifest.Key)
	fmt.Printf("  name:        %s\n", b.Manifest.Name)
	fmt.Printf("  version:     %s\n", b.Manifest.Version)
	fmt.Printf("  kernel:      %s\n", b.Manifest.Kernel)
	fmt.Printf("  models:      %d\n", len(b.Manifest.ModelDefinitions))
	fmt.Printf("  capabilities:%d\n", len(b.Manifest.Capabilities))
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
// init
// ---------------------------------------------------------------------------

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	_ = fs.Parse(args)
	if fs.NArg() < 1 {
		return fmt.Errorf("init: missing <key>")
	}
	key := fs.Arg(0)
	m := &manifest.Manifest{
		Key:         key,
		Name:        strings.Title(key), //nolint:staticcheck
		Description: "Generated by metacore init",
		Version:     "0.1.0",
		Category:    "utility",
		Icon:        "Package",
		Kernel:      ">=2.0.0 <3.0.0",
		Author:      "you@example.com",
		License:     "MIT",
		ModelDefinitions: []manifest.ModelDefinition{
			{
				TableName: key + "_items",
				ModelKey:  key + "_items",
				Label:     "Items",
				OrgScoped: true,
				Columns: []manifest.ColumnDef{
					{Name: "title", Type: "string", Size: 255, Required: true},
					{Name: "body", Type: "text"},
				},
			},
		},
		Capabilities: []manifest.Capability{
			{Kind: "db:read", Target: "users", Reason: "Display author names"},
		},
		Frontend: &manifest.FrontendSpec{
			Entry:  "./frontend/remoteEntry.js",
			Format: "federation",
			Expose: "./plugin",
		},
	}
	if err := m.Validate(manifest.APIVersion); err != nil {
		return fmt.Errorf("scaffold would be invalid: %w", err)
	}

	if err := os.MkdirAll(filepath.Join(key, "migrations"), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(key, "frontend", "src"), 0o755); err != nil {
		return err
	}

	mb, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(key, "manifest.json"), mb, 0o644); err != nil {
		return err
	}
	initSQL := fmt.Sprintf(`-- Initial schema for addon %q.
-- The host installs this under the isolated schema addon_%s.
CREATE TABLE IF NOT EXISTS %s_items (
  id         uuid PRIMARY KEY,
  org_id     uuid NOT NULL,
  title      varchar(255) NOT NULL,
  body       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`, key, key, key)
	if err := os.WriteFile(filepath.Join(key, "migrations", "0001_init.sql"), []byte(initSQL), 0o644); err != nil {
		return err
	}
	pluginStub := fmt.Sprintf(`// Federated entry for addon %q.
// Exposed as "./plugin" per manifest.frontend.expose.
export default {
  key: %q,
  register(ctx) {
    // ctx.registerRoute("/m/%s", () => <div>Hello from %s</div>);
  },
};
`, key, key, key, key)
	if err := os.WriteFile(filepath.Join(key, "frontend", "src", "plugin.tsx"), []byte(pluginStub), 0o644); err != nil {
		return err
	}
	readme := fmt.Sprintf("# %s\n\nAddon scaffolded by `metacore init`.\n", key)
	if err := os.WriteFile(filepath.Join(key, "README.md"), []byte(readme), 0o644); err != nil {
		return err
	}
	fmt.Printf("scaffolded ./%s (key=%s version=%s)\n", key, key, m.Version)
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func readManifest(dir string) (*manifest.Manifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var m manifest.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}
