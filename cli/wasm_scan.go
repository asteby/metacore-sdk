package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/asteby/metacore-kernel/manifest"
)

// scanWASM validates that the addon's .wasm module exports exactly the
// functions that the manifest.hooks keys imply, and that manifest.backend.exports
// matches the real module exports. Runs only when manifest.Backend.Runtime=="wasm".
//
// It implements a tiny WASM parser (enough of the Export section, id=7) using
// stdlib only. The WASM binary format is magic "\x00asm" + version u32 + a
// sequence of sections. Each section is `id:u8 size:uleb128 payload:bytes`.
// The Export section payload is `count:uleb128` followed by entries of
// `nameLen:uleb128 nameBytes kind:u8 index:uleb128`.
func scanWASM(srcDir string, m *manifest.Manifest, r *gateResult) {
	if m.Backend == nil || m.Backend.Runtime != "wasm" {
		return
	}
	entry := "backend/backend.wasm"
	if m.Backend.Entry != "" {
		entry = m.Backend.Entry
	}
	wasmPath := filepath.Join(srcDir, entry)
	data, err := os.ReadFile(wasmPath)
	if err != nil {
		if os.IsNotExist(err) {
			r.errf("backend.runtime=wasm but %s not found — run `metacore compile-wasm`", entry)
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
	declaredSet := map[string]bool{}
	for _, name := range m.Backend.Exports {
		declaredSet[name] = true
		if !realSet[name] {
			r.errf("manifest.backend.exports declares %q but the %s module does not export it", name, entry)
		}
	}
	// Each hook key "<model>::<action>" requires <action> to be both declared
	// in manifest.backend.exports AND present in the compiled module.
	for hookKey := range m.Hooks {
		parts := strings.SplitN(hookKey, "::", 2)
		if len(parts) != 2 {
			continue
		}
		action := parts[1]
		if !declaredSet[action] {
			r.errf("hooks[%q] requires manifest.backend.exports to include %q", hookKey, action)
		}
		if !realSet[action] {
			r.errf("hooks[%q] requires %s to export %q", hookKey, entry, action)
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
