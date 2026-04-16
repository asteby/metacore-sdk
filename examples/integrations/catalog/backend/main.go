// catalog WASI module.
package main

import "encoding/json"

func main() {}

//export update_stock
func updateStockExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doUpdateStock(req)))
}

//export toggle_published
func togglePublishedExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doTogglePublished(req)))
}

//export search_products
func searchProductsExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doSearchProducts(req)))
}

//export get_product
func getProductExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doGetProduct(req)))
}

func errorJSON(msg string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": false, "error": msg})
	return b
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
