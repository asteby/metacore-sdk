package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/asteby/metacore-kernel/bundle"
)

// epoch is the fixed timestamp stamped on every bundle entry so the archive is
// byte-for-byte reproducible. It mirrors the kernel bundle writer's epoch.
var epoch = time.Unix(0, 0).UTC()

// writeBundleV3 packs a bundle.Bundle into a reproducible tar.gz, writing the
// verbatim v3 manifest (b.RawManifest) as manifest.json.
//
// The kernel's bundle.Write marshals the *legacy* manifest.Manifest, which
// would down-convert a v3 document (collapsing models[].columns, dropping
// kind:Preset/Theme blocks, rewriting contributions back into the v2 shape).
// The SDK toolchain must ship the author's v3 contract untouched so the
// kernel installer dual-reads the real document, so we own the manifest.json
// entry here and delegate nothing of it to the kernel writer. Migrations,
// frontend, backend and README packing match bundle.Write entry-for-entry.
func writeBundleV3(w io.Writer, b *bundle.Bundle) error {
	if b == nil {
		return fmt.Errorf("bundle: nil")
	}
	if len(b.RawManifest) == 0 {
		return fmt.Errorf("bundle: RawManifest is empty — v3 packing needs the verbatim manifest.json bytes")
	}
	gz := gzip.NewWriter(w)
	gz.ModTime = epoch
	tw := tar.NewWriter(gz)

	write := func(name string, data []byte) error {
		if strings.Contains(name, "..") {
			return fmt.Errorf("bundle: path traversal in %q", name)
		}
		h := &tar.Header{
			Name:     name,
			Mode:     0o644,
			Size:     int64(len(data)),
			ModTime:  epoch,
			Typeflag: tar.TypeReg,
			Format:   tar.FormatPAX,
		}
		if err := tw.WriteHeader(h); err != nil {
			return err
		}
		_, err := tw.Write(data)
		return err
	}

	// 1. manifest.json — verbatim v3 bytes.
	if err := write("manifest.json", b.RawManifest); err != nil {
		return err
	}

	// 2. migrations — sorted by Version for deterministic output.
	migs := make([]struct {
		Version string
		SQL     string
	}, 0, len(b.Migrations))
	for _, m := range b.Migrations {
		migs = append(migs, struct {
			Version string
			SQL     string
		}{m.Version, m.SQL})
	}
	sort.Slice(migs, func(i, j int) bool { return migs[i].Version < migs[j].Version })
	for _, m := range migs {
		if err := write(path.Join("migrations", m.Version+".sql"), []byte(m.SQL)); err != nil {
			return err
		}
	}

	// 3. frontend — sorted by path.
	fkeys := make([]string, 0, len(b.Frontend))
	for k := range b.Frontend {
		fkeys = append(fkeys, k)
	}
	sort.Strings(fkeys)
	for _, k := range fkeys {
		name := k
		if !strings.HasPrefix(name, "frontend/") {
			name = path.Join("frontend", k)
		}
		if err := write(name, b.Frontend[k]); err != nil {
			return err
		}
	}

	// 4. backend — sorted by path.
	bkeys := make([]string, 0, len(b.Backend))
	for k := range b.Backend {
		bkeys = append(bkeys, k)
	}
	sort.Strings(bkeys)
	for _, k := range bkeys {
		name := k
		if !strings.HasPrefix(name, "backend/") {
			name = path.Join("backend", k)
		}
		if err := write(name, b.Backend[k]); err != nil {
			return err
		}
	}

	// 5. README.md
	if b.Readme != "" {
		if err := write("README.md", []byte(b.Readme)); err != nil {
			return err
		}
	}

	if err := tw.Close(); err != nil {
		return err
	}
	return gz.Close()
}
