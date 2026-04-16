// fiscal_mexico WASI module. The host (metacore kernel) calls exports by
// ABI — no HTTP server. Build with: tinygo build -target=wasi -o backend.wasm
package main

import "encoding/json"

// TinyGo requires a main() even for reactor-style WASI modules.
func main() {}

// stamp_fiscal is called by the host with a (ptr<<32)|len pointing to a
// JSON-encoded stampReq in linear memory. Returns (ptr<<32)|len of a JSON
// stampResp; host reads it back and frees.
//
//export stamp_fiscal
func stampFiscal(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req stampReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	resp := doStamp(req)
	out, _ := json.Marshal(resp)
	return writeOutput(out)
}

//export cancel_fiscal
func cancelFiscal(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req cancelReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	resp := doCancel(req)
	out, _ := json.Marshal(resp)
	return writeOutput(out)
}

func errorJSON(msg string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": false, "error": msg})
	return b
}
