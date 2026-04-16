package main

import "unsafe"

// ABI helpers. The host writes input into linear memory (after calling
// `alloc`), passes ptr<<32|len to the export, then reads the returned
// ptr<<32|len and calls `free`.

// alloc reserves `size` bytes in the module's linear memory and returns a
// pointer the host can write into.
//
//export alloc
func alloc(size uint32) uint32 {
	buf := make([]byte, size)
	// Pin so GC doesn't move/collect it before the host hands it back.
	pinned[uintptr(unsafe.Pointer(&buf[0]))] = buf
	return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

//export free
func free(ptr, _size uint32) {
	delete(pinned, uintptr(ptr))
}

// pinned keeps alloc'd buffers alive between host round-trips.
var pinned = map[uintptr][]byte{}

// readInput copies `len` bytes starting at `ptr` into a Go slice.
func readInput(ptrLen uint64) []byte {
	ptr := uint32(ptrLen >> 32)
	ln := uint32(ptrLen)
	if ln == 0 {
		return nil
	}
	src := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), ln)
	out := make([]byte, ln)
	copy(out, src)
	return out
}

// writeOutput allocates a host-readable buffer, copies `data` into it and
// returns (ptr<<32)|len. The host MUST call `free` after reading.
func writeOutput(data []byte) uint64 {
	if len(data) == 0 {
		return 0
	}
	ptr := alloc(uint32(len(data)))
	dst := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), len(data))
	copy(dst, data)
	return (uint64(ptr) << 32) | uint64(len(data))
}
