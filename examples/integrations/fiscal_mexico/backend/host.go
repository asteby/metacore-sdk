package main

import (
	"errors"
	"unsafe"
)

// Host imports. The kernel provides these under module `metacore_host`.
// Capabilities declared in manifest.json gate which URLs `http_fetch` may
// reach (e.g. *.factura.com).

//go:wasmimport metacore_host http_fetch
func _hostHTTPFetch(urlPtr, urlLen, methPtr, methLen, bodyPtr, bodyLen uint32) uint64

//go:wasmimport metacore_host log
func _hostLog(msgPtr, msgLen uint32)

//go:wasmimport metacore_host env_get
func _hostEnvGet(keyPtr, keyLen uint32) uint64

// --- Go-friendly wrappers ---

func hostLog(msg string) {
	if msg == "" {
		return
	}
	b := []byte(msg)
	_hostLog(uint32(uintptr(unsafe.Pointer(&b[0]))), uint32(len(b)))
}

// hostFetch performs an outbound HTTP request via the host. Returns the raw
// response body. Host is responsible for capability enforcement.
func hostFetch(url, method string, body []byte) ([]byte, error) {
	ub := []byte(url)
	mb := []byte(method)
	var bp *byte
	var bl uint32
	if len(body) > 0 {
		bp = &body[0]
		bl = uint32(len(body))
	}
	r := _hostHTTPFetch(
		uint32(uintptr(unsafe.Pointer(&ub[0]))), uint32(len(ub)),
		uint32(uintptr(unsafe.Pointer(&mb[0]))), uint32(len(mb)),
		uint32(uintptr(unsafe.Pointer(bp))), bl,
	)
	if r == 0 {
		return nil, errors.New("host http_fetch failed")
	}
	return readInput(r), nil
}

// hostEnvGet reads a host-provided env/setting (e.g. "api_key" from the
// addon settings, scoped per installation).
func hostEnvGet(key string) string {
	kb := []byte(key)
	r := _hostEnvGet(uint32(uintptr(unsafe.Pointer(&kb[0]))), uint32(len(kb)))
	if r == 0 {
		return ""
	}
	return string(readInput(r))
}
