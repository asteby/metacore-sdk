// tickets WASI module.
package main

import "encoding/json"

func main() {}

//export resolve
func resolveExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doResolve(req)))
}

//export reassign
func reassignExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doReassign(req)))
}

//export create_ticket
func createTicketExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doCreateTicket(req)))
}

//export update_ticket
func updateTicketExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doUpdateTicket(req)))
}

func errorJSON(msg string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": false, "error": msg})
	return b
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
