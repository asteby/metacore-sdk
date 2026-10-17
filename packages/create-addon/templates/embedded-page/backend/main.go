// {{ADDON_KEY}} addon — WASM backend.
//
// Serves the `summary` route of manifest.json#contributions.api (GET
// /{{ADDON_KEY}}/summary, auth "staff"). The kernel API gateway (mounted by the
// host at /api/gw) authenticates the operator, resolves the organization and
// hands this export the request envelope; the page calls it through the host
// client: `useHostApi().get('/gw/{{ADDON_KEY}}/summary')` — never with a token
// of its own.
//
// Envelope (kernel runtime/apiroute):
//
//	in : {"addon","route","method","path","params","query","headers","auth":{"kind","user_id"},"org"}
//	out: {"status":200,"headers":{"Cache-Control":"private, no-store"},"body":{...}}
package main

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport metacore_host log
func hostLog(ptr, length uint32)

// alloc reserves `size` bytes in guest memory for the request payload.
//
//go:export alloc
func alloc(size uint32) uint32 {
	buf := make([]byte, size)
	return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

type request struct {
	Route string              `json:"route"`
	Query map[string][]string `json:"query"`
	Auth  struct {
		Kind   string `json:"kind"`
		UserID string `json:"user_id"`
	} `json:"auth"`
	Org string `json:"org"`
}

// summary answers the board page. Replace the body with real figures (read
// your rows through the kernel host functions, see kernel docs/wasm-abi.md);
// keep business math here, never in the page.
//
//go:export summary
func summary(ptr, length uint32) uint64 {
	in := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), length)
	var req request
	if err := json.Unmarshal(in, &req); err != nil {
		return respond(400, map[string]string{"code": "invalid_request", "message": err.Error()})
	}
	logf("summary for org=" + req.Org + " user=" + req.Auth.UserID)
	return respond(200, map[string]any{
		"addon": "{{ADDON_KEY}}",
		"cards": []map[string]any{
			{"key": "open", "label": "Abiertos", "value": 0},
			{"key": "due_today", "label": "Vencen hoy", "value": 0},
		},
	})
}

func respond(status int, body any) uint64 {
	out, err := json.Marshal(map[string]any{"status": status, "body": body})
	if err != nil {
		out = []byte(`{"status":500,"body":{"code":"runtime_error"}}`)
	}
	p := uint32(uintptr(unsafe.Pointer(&out[0])))
	return (uint64(p) << 32) | uint64(len(out))
}

func logf(msg string) {
	b := []byte(msg)
	hostLog(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
}

func main() {} // required by tinygo
