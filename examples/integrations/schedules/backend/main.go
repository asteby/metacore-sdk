// schedules WASI module.
package main

import "encoding/json"

func main() {}

//export confirm
func confirmExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doConfirm(req)))
}

//export reschedule
func rescheduleExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doReschedule(req)))
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

//export create_event
func createEventExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doCreateEvent(req)))
}

//export list_events
func listEventsExport(ptrLen uint64) uint64 {
	data := readInput(ptrLen)
	var req actionReq
	if err := json.Unmarshal(data, &req); err != nil {
		return writeOutput(errorJSON("bad request: " + err.Error()))
	}
	return writeOutput(mustJSON(doListEvents(req)))
}

func errorJSON(msg string) []byte {
	b, _ := json.Marshal(map[string]any{"ok": false, "error": msg})
	return b
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
