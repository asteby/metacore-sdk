// orders WASI module. Build with: tinygo build -target=wasi -o backend.wasm
package main

import "encoding/json"

func main() {}

//export fulfill
func fulfillExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doFulfill(req)))
}

//export cancel
func cancelExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doCancel(req)))
}

//export create_order
func createOrderExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doCreateOrder(req)))
}

//export get_order
func getOrderExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doGetOrder(req)))
}

func errorJSON(msg string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": false, "error": msg})
	return b
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
