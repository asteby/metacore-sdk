// {{ADDON_KEY}} addon — WASM backend entrypoint.
//
// Compiled to `backend.wasm` and invoked by the metacore kernel via the
// documented WASM ABI (kernel docs/wasm-abi.md). One exported function per
// `manifest.backend.exports`; the host packs the request as (ptr, len) and
// expects an i64 packed (ptr<<32)|len response.
package main

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport metacore_host log
func hostLog(ptr, length uint32)

//go:wasmimport metacore_host event_emit
func hostEventEmit(eventPtr, eventLen, payloadPtr, payloadLen uint32) uint64

// alloc is the bump allocator the host calls to reserve `size` bytes in guest
// memory before copying the request payload in.
//
//go:export alloc
func alloc(size uint32) uint32 {
	buf := make([]byte, size)
	return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

// mark_done handles the `{{ADDON_KEY}}_items.mark_done` action. Receives the
// row payload as JSON `{ id, currentStatus, ... }` and returns either:
//   - `{"success": true, "data": { "status": "done" }}` to commit the action, or
//   - `{"success": false, "error": { "code": "..." }}` to roll it back.
//
//go:export mark_done
func mark_done(ptr, length uint32) uint64 {
	in := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), length)

	var req struct {
		ID            string `json:"id"`
		CurrentStatus string `json:"status"`
	}
	if err := json.Unmarshal(in, &req); err != nil {
		return writeJSON(map[string]any{
			"success": false,
			"error": map[string]string{
				"code":    "invalid_payload",
				"message": err.Error(),
			},
		})
	}

	logf("mark_done invoked id=" + req.ID + " current=" + req.CurrentStatus)

	// Publish a domain event so other addons / subscribers can react. Requires
	// `event:emit {{ADDON_KEY}}.*` in manifest.capabilities — already declared.
	payload, _ := json.Marshal(map[string]string{
		"id":     req.ID,
		"status": "done",
	})
	emit("{{ADDON_KEY}}.item.completed", payload)

	return writeJSON(map[string]any{
		"success": true,
		"data": map[string]string{
			"status": "done",
		},
	})
}

// writeJSON marshals `v` and returns the packed (ptr<<32)|len i64 the host
// expects. The buffer escapes to the heap — fine, each invocation runs in a
// fresh module instance so globals don't accumulate.
func writeJSON(v any) uint64 {
	buf, err := json.Marshal(v)
	if err != nil {
		// Fall back to a hard-coded error envelope; never panic out of a
		// handler — the host treats panics as `runtime_error`.
		buf = []byte(`{"success":false,"error":{"code":"runtime_error"}}`)
	}
	p := uint32(uintptr(unsafe.Pointer(&buf[0])))
	return (uint64(p) << 32) | uint64(len(buf))
}

func logf(msg string) {
	b := []byte(msg)
	hostLog(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
}

func emit(event string, payload []byte) {
	eb := []byte(event)
	ePtr := uint32(uintptr(unsafe.Pointer(&eb[0])))
	var pPtr, pLen uint32
	if len(payload) > 0 {
		pPtr = uint32(uintptr(unsafe.Pointer(&payload[0])))
		pLen = uint32(len(payload))
	}
	_ = hostEventEmit(ePtr, uint32(len(eb)), pPtr, pLen)
}

func main() {} // required by tinygo
