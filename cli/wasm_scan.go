package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"

	v3 "github.com/asteby/metacore-kernel/manifest/v3"
)

// wasmHandlerFunctions collects every function named by a wasm handler across
// the v3 contract: action / tool / subscription handlers plus the lifecycle
// hooks and the upgrade ladder. Under v3 there is no separate backend.exports
// list — the wasm handler functions declared in the manifest ARE the exports
// the compiled module must ship (kernel ≥ v0.18.0). This function is the
// single source of truth for "what exports must exist".
func wasmHandlerFunctions(m *v3.Manifest) map[string]bool {
	fns := map[string]bool{}
	add := func(h v3.Handler) {
		if h.Type == "wasm" && h.Function != "" {
			fns[h.Function] = true
		}
	}
	if m.Contributions != nil {
		for _, a := range m.Contributions.Actions {
			add(a.Handler)
		}
		for _, t := range m.Contributions.Tools {
			add(t.Handler)
		}
		for _, s := range m.Contributions.Subscriptions {
			add(s.Handler)
		}
	}
	if m.Lifecycle != nil {
		for _, fn := range []string{m.Lifecycle.Install, m.Lifecycle.Uninstall, m.Lifecycle.Enable, m.Lifecycle.Disable} {
			if fn != "" {
				fns[fn] = true
			}
		}
		for _, step := range m.Lifecycle.Upgrade {
			if step.Type == "wasm" && step.Function != "" {
				fns[step.Function] = true
			}
		}
	}
	return fns
}

// scanWASM validates that the addon's backend/backend.wasm module exports every
// function the v3 manifest's wasm handlers reference. It runs only when a
// backend.wasm is present (the v3 contract has no backend block, so the
// presence of the compiled artifact — not a manifest flag — decides whether the
// module is in play). When the manifest declares wasm handlers but no module
// exists, that's an error: the author forgot to compile.
//
// It implements a tiny WASM parser (enough of the Export section, id=7) using
// stdlib only. The WASM binary format is magic "\x00asm" + version u32 + a
// sequence of sections. Each section is `id:u8 size:uleb128 payload:bytes`.
// The Export section payload is `count:uleb128` followed by entries of
// `nameLen:uleb128 nameBytes kind:u8 index:uleb128`.
func scanWASM(srcDir string, m *v3.Manifest, r *gateResult) {
	declared := wasmHandlerFunctions(m)

	entry := "backend/backend.wasm"
	wasmPath := filepath.Join(srcDir, entry)
	data, err := os.ReadFile(wasmPath)
	if err != nil {
		if os.IsNotExist(err) {
			if len(declared) > 0 {
				r.errf("manifest declares %d wasm handler function(s) but %s not found — run `metacore compile-wasm`", len(declared), entry)
			}
			return
		}
		r.errf("read %s: %v", entry, err)
		return
	}
	exports, err := parseWASMExports(data)
	if err != nil {
		r.errf("%s: %v", entry, err)
		return
	}
	realSet := map[string]bool{}
	for _, name := range exports {
		realSet[name] = true
	}
	for fn := range declared {
		if !realSet[fn] {
			r.errf("manifest declares a wasm handler function %q but the %s module does not export it", fn, entry)
		}
	}
}

// parseWASMExports walks the module binary and returns the names of every
// entry in the Export section (id=7). Only the Export section is parsed; other
// sections are skipped. Returns an error if the magic/version are wrong.
func parseWASMExports(data []byte) ([]string, error) {
	if len(data) < 8 {
		return nil, fmt.Errorf("wasm: too short")
	}
	if string(data[:4]) != "\x00asm" {
		return nil, fmt.Errorf("wasm: bad magic")
	}
	if binary.LittleEndian.Uint32(data[4:8]) != 1 {
		return nil, fmt.Errorf("wasm: unsupported version")
	}
	p := 8
	var exports []string
	for p < len(data) {
		if p >= len(data) {
			break
		}
		secID := data[p]
		p++
		size, n, err := readULEB128(data[p:])
		if err != nil {
			return nil, fmt.Errorf("wasm: section size: %w", err)
		}
		p += n
		end := p + int(size)
		if end > len(data) {
			return nil, fmt.Errorf("wasm: section %d truncated", secID)
		}
		if secID == 7 {
			// Export section.
			sp := p
			count, cn, err := readULEB128(data[sp:end])
			if err != nil {
				return nil, fmt.Errorf("wasm: export count: %w", err)
			}
			sp += cn
			for i := uint64(0); i < count; i++ {
				nameLen, ln, err := readULEB128(data[sp:end])
				if err != nil {
					return nil, fmt.Errorf("wasm: export name len: %w", err)
				}
				sp += ln
				if sp+int(nameLen) > end {
					return nil, fmt.Errorf("wasm: export name truncated")
				}
				name := string(data[sp : sp+int(nameLen)])
				sp += int(nameLen)
				if sp >= end {
					return nil, fmt.Errorf("wasm: export kind missing")
				}
				// kind:u8
				sp++
				_, xn, err := readULEB128(data[sp:end])
				if err != nil {
					return nil, fmt.Errorf("wasm: export index: %w", err)
				}
				sp += xn
				exports = append(exports, name)
			}
		}
		p = end
	}
	return exports, nil
}

// readULEB128 decodes an unsigned LEB128 varint and returns (value, bytesRead).
func readULEB128(b []byte) (uint64, int, error) {
	var result uint64
	var shift uint
	for i := 0; i < len(b); i++ {
		x := b[i]
		result |= uint64(x&0x7f) << shift
		if x&0x80 == 0 {
			return result, i + 1, nil
		}
		shift += 7
		if shift >= 64 {
			return 0, 0, fmt.Errorf("uleb128 overflow")
		}
	}
	return 0, 0, fmt.Errorf("uleb128 truncated")
}
