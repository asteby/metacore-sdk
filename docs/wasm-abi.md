# WASM ABI (v1.1 — proposal)

The metacore kernel can run addon backends as sandboxed WebAssembly modules
via [wazero](https://wazero.io). This document is the contract between the
guest (your addon) and the host (the kernel).

> ABI version: **1.1** (proposal — `db_query` host import added, no breaking
> changes vs. v1).
> Bundled via `manifest.backend.runtime = "wasm"`.
> Implementation: `kernel/runtime/wasm/abi.go`.

### Version history

| Version | Status   | Changes |
|---------|----------|---------|
| 1.0     | shipped  | initial surface: `log`, `env_get`, `http_fetch`. |
| 1.1     | proposal | adds `db_query` host import; guests built against 1.0 keep working. |

## 1. Declaration

```json
"backend": {
  "runtime": "wasm",
  "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket", "ping"],
  "memory_limit_mb": 64,
  "timeout_ms": 10000
}
```

Only symbols listed in `exports` can be dispatched by the host. Limits
default to 64 MiB and 10 s.

## 2. Required guest exports

Every WASM module MUST export:

### `memory`

The module's linear memory (default name `memory`). The host reads and
writes buffers through it.

### `alloc(size: i32) -> i32`

A bump (or pool) allocator the host calls to reserve `size` bytes in guest
memory before copying the request payload in. Return value is the guest
pointer. Must succeed for any size up to the configured memory limit.

### `<action_key>(ptr: i32, len: i32) -> i64`

One per entry in `exports`. `(ptr, len)` is the request body (JSON, by
convention). The return value is a **packed (ptr, len)** response:

```
result_i64 = (uint64(ptr) << 32) | uint64(len)
```

A return of `0` means "empty success". To signal an error, the guest writes
a JSON envelope of the form `{"error": "..."}` and the host-side surface
layer interprets it. Exceeding `timeout_ms` aborts the instance.

## 3. Host imports (module `metacore_host`)

The host module exposes these functions; all pointer arguments are i32 and
reference guest memory:

```
log(msgPtr i32, msgLen i32)
  -> void. Writes a structured log line tagged with the addon key.

env_get(keyPtr i32, keyLen i32) -> i64
  -> packed (ptr, len) in guest memory of the setting value, or 0 if missing.
     Backed by the installation's `settings` map; secrets are allowed.

http_fetch(urlPtr, urlLen, methPtr, methLen, bodyPtr, bodyLen i32) -> i64
  -> packed (ptr, len) of the response body. Subject to the addon's
     `http:fetch` capabilities and the egress SSRF guard (see capabilities.md).

db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64   [v1.1]
  -> packed (ptr, len) of a JSON envelope with rows. Scoped to the addon's
     own schema (`SET LOCAL search_path TO addon_<key>, public` per call) and
     gated by `db:read` capabilities for any cross-schema reference. Read-only
     in v1.1 — see § 9 for the full contract.
```

The host allocates response buffers inside guest memory via `alloc`, writes
into them, and returns the packed pointer. The guest is responsible for
reading before triggering another allocation.

## 4. Minimal TinyGo example

```go
// backend/main.go — stub que recibe payload y devuelve eco.
package main

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport metacore_host log
func hostLog(ptr, length uint32)

// alloc es el bump allocator que el host llama antes de escribir el payload.
//
//go:export alloc
func alloc(size uint32) uint32 {
	buf := make([]byte, size)
	return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

// ping recibe (ptr, len) y devuelve un i64 packeado (ptr<<32)|len.
//
//go:export ping
func ping(ptr, length uint32) uint64 {
	in := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), length)
	var req struct{ Message string `json:"message"` }
	_ = json.Unmarshal(in, &req)

	msg := []byte("hello from wasm: " + req.Message)
	hostLog(uint32(uintptr(unsafe.Pointer(&msg[0]))), uint32(len(msg)))

	resp, _ := json.Marshal(map[string]string{"reply": "pong", "echo": req.Message})
	p := uint32(uintptr(unsafe.Pointer(&resp[0])))
	return (uint64(p) << 32) | uint64(len(resp))
}

func main() {} // requerido por tinygo
```

## 5. Building

### With TinyGo directly

```bash
tinygo build -target=wasi -opt=z -no-debug -o backend/backend.wasm ./backend/
```

Flags explained:

- `-target=wasi` — enables WASI stdlib shims needed for `encoding/json`.
- `-opt=z` — optimize for size. Typical backends end up 100-400 KiB.
- `-no-debug` — drops DWARF sections; the host does not need them.

### With the CLI wrapper

```bash
metacore compile-wasm .
```

Equivalent to the command above, but with the correct flags and output path
derived from `manifest.backend.entry`.

## 6. Memory & reentrancy rules

- Each invocation runs in a **fresh module instance**. Globals do not
  persist between calls.
- The guest allocator may be a single-shot bump allocator; the host
  tolerates that since each call gets a new instance.
- Callbacks into host imports are synchronous. The host serializes
  invocations per installation.

## 7. Error surface

Return packed pointer to a JSON object. The recommended shape is:

```json
{ "error": { "code": "not_found", "message": "ticket 42 missing" } }
```

The host forwards this verbatim to the caller (webhook response, action
result, tool invocation). Panics and abort traps are reported as
`{"code": "runtime_error"}`.

## 8. Capability enforcement

Host imports check the addon's compiled capabilities before execution:

- `http_fetch` calls `Capabilities.CanFetch(url)`.
- `db_query` (v1.1) parses the SQL, walks every referenced relation, and
  calls `Capabilities.CanReadModel(<schema>.<table>)` for any reference
  that resolves outside `addon_<key>`. The owning addon's own schema is
  always permitted (implicit `addon_<key>.*`).

If an import is denied, the host returns a packed buffer whose JSON payload
contains `{"error":{"code":"forbidden","message":"..."}}`.

## 9. `db_query` — scoped read-only SQL (v1.1)

`db_query` is the dedicated database import. It is intentionally narrow: a
single read-only statement, scoped to the addon's schema, parameterised, and
capability-checked. Mutating SQL belongs to a separate `db_exec` import that
will land in a future minor version.

### 9.1 Signature

```
db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64
```

| Param      | Type | Meaning                                                                |
|------------|------|------------------------------------------------------------------------|
| `sqlPtr`   | i32  | Guest pointer to the SQL text.                                         |
| `sqlLen`   | i32  | Length in bytes (UTF-8). Hard cap: 16 KiB.                             |
| `argsPtr`  | i32  | Guest pointer to a JSON array of positional arguments. May be `0`.     |
| `argsLen`  | i32  | Length of the JSON array buffer. `0` if the query has no parameters.   |
| **return** | i64  | Packed `(ptr<<32)\|len` of the response envelope (see § 9.4).          |

A return of `0` is reserved and currently never produced — `db_query` always
allocates an envelope, even for zero-row results.

### 9.2 SQL contract

- **Read-only**: only `SELECT` (and `WITH … SELECT`) is accepted in v1.1.
  Any other top-level statement (`INSERT`, `UPDATE`, `DELETE`, `MERGE`,
  `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `COPY`, `GRANT`, `SET`, `CALL`,
  `DO`, `LISTEN`, `NOTIFY`, `BEGIN`, `COMMIT`) is rejected with
  `invalid_sql`.
- **Single statement**: the input is parsed into a statement list and must
  contain exactly one node. Trailing `;` is tolerated; multi-statement
  payloads are rejected with `invalid_sql`.
- **Parameters**: positional placeholders use Postgres syntax (`$1`, `$2`,
  …). The arg count must equal the highest placeholder index — otherwise
  `arg_count_mismatch`.
- **No `SET search_path`**: the host issues `SET LOCAL search_path` on
  every call and rejects guest-side overrides at parse time.
- **No `pg_*` / `information_schema`** lookups in v1.1 — these are
  filtered to keep the surface explainable. (Schema introspection has its
  own dedicated import on the roadmap.)

### 9.3 Schema scope & capability check

The host wraps every invocation in a transaction-scoped `SET LOCAL
search_path TO addon_<key>, public`. Bare table names therefore resolve
against the addon's own schema first.

For each parsed relation reference the host computes a fully-qualified
`<schema>.<table>` and decides:

| Reference                         | Outcome                                                                  |
|-----------------------------------|--------------------------------------------------------------------------|
| Bare name resolved into `addon_<key>` | Allowed. Implicit `addon_<key>.*` capability.                        |
| `addon_<key>.<table>` (qualified) | Allowed.                                                                 |
| `public.<table>` or other schema  | Requires `db:read <schema>.<table>` or `db:read <schema>.*`.             |
| `pg_*` / `information_schema.*`   | Always denied (`forbidden`, `reason: "introspection_disabled"`).         |

Cross-tenant scoping (org filters) is **orthogonal** and applied by the
host transparently for any model that carries an `org_id` column — see
`kernel/docs/permissions.md` for the row-level rules.

### 9.4 Response envelope

The response follows the kernel `{success, data, meta}` convention:

```json
{
  "success": true,
  "data": {
    "rows":    [ { "id": 1, "title": "..." }, … ],
    "rowCount": 42,
    "columns": [
      { "name": "id",    "type": "int8" },
      { "name": "title", "type": "text" }
    ]
  },
  "meta": {
    "schema":     "addon_tickets",
    "durationMs": 7,
    "truncated":  false
  }
}
```

Errors share the same outer shape:

```json
{
  "success": false,
  "error":   { "code": "forbidden", "message": "addon \"tickets\" lacks db:read \"billing.invoices\"" },
  "meta":    { "schema": "addon_tickets", "durationMs": 1 }
}
```

Defined error codes:

| Code                  | When                                                                |
|-----------------------|---------------------------------------------------------------------|
| `invalid_sql`         | Parse failure, multi-statement, non-`SELECT`, banned construct.     |
| `arg_count_mismatch`  | Highest `$N` placeholder ≠ JSON args length.                        |
| `arg_decode`          | `argsPtr/argsLen` is not valid JSON or contains an unsupported type.|
| `forbidden`           | Capability check failed for one of the referenced relations.        |
| `query_timeout`       | Statement exceeded the per-call DB deadline (default 5 s, see § 9.5).|
| `row_limit_exceeded`  | Result set exceeded the configured row cap (default 10 000).        |
| `db_error`            | Underlying driver/SQL error (message redacted, code preserved).     |

### 9.5 Limits

| Knob                | Default | Configurable via                                  |
|---------------------|---------|---------------------------------------------------|
| Max SQL length      | 16 KiB  | host-side (`runtime/wasm` config).                |
| Max args            | 64      | host-side.                                        |
| Per-call deadline   | 5 s     | bounded by `manifest.backend.timeout_ms` (lower wins). |
| Max rows            | 10 000  | host-side; emits `row_limit_exceeded` past it.    |
| Max response bytes  | 8 MiB   | host-side; mirrors the `http_fetch` cap.          |

### 9.6 Allowed argument types

JSON args are decoded into the driver's native types as follows:

| JSON                      | Postgres parameter type    |
|---------------------------|----------------------------|
| `null`                    | `NULL`                     |
| `true` / `false`          | `bool`                     |
| integer literal           | `int8`                     |
| floating literal          | `float8`                   |
| string                    | `text`                     |
| `{"$bytes": "<base64>"}`  | `bytea`                    |
| `{"$uuid":  "<uuid>"}`    | `uuid`                     |
| `{"$ts":    "<RFC3339>"}` | `timestamptz`              |

Plain JSON arrays/objects are rejected with `arg_decode` — the driver-level
`jsonb` round-trip is intentionally explicit (`{"$jsonb": …}` is reserved
for v1.2 once nested encoding is finalised).

### 9.7 Minimal TinyGo example

```go
//go:wasmimport metacore_host db_query
func hostDBQuery(sqlPtr, sqlLen, argsPtr, argsLen uint32) uint64

func listOpenTickets(assignee string) ([]byte, error) {
	const sql = "SELECT id, title FROM tickets WHERE assignee = $1 AND status = 'open'"
	args := []byte(`["` + assignee + `"]`) // pre-escape for the example

	sp := uint32(uintptr(unsafe.Pointer(unsafe.StringData(sql))))
	ap := uint32(uintptr(unsafe.Pointer(&args[0])))
	res := hostDBQuery(sp, uint32(len(sql)), ap, uint32(len(args)))
	if res == 0 {
		return nil, errors.New("empty response")
	}
	ptr := uint32(res >> 32)
	n   := uint32(res)
	return unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), n), nil
}
```

The TypeScript SDK ships a thin wrapper (`@asteby/metacore-addon-sdk`):

```ts
const { rows } = await db.query<{ id: number; title: string }>(
  'SELECT id, title FROM tickets WHERE assignee = $1',
  [assignee],
)
```

### 9.8 Manifest declarations

Reading the addon's own schema needs no declaration. Reading anything else
requires explicit capabilities — same as today:

```json
"capabilities": [
  { "kind": "db:read", "target": "users",          "reason": "Show ticket author names" },
  { "kind": "db:read", "target": "addon_billing.*", "reason": "Cross-link invoices" }
]
```

### 9.9 Out of scope for v1.1

These are deliberately **not** in v1.1 and will land as separate proposals
once the read path is exercised in production:

- `db_exec` for `INSERT`/`UPDATE`/`DELETE`. Will require additional
  audit hooks and an outbox-style write log.
- Streaming cursors. v1.1 buffers the full result set in host memory; large
  reports should pre-aggregate in SQL.
- Prepared-statement caching across invocations. Each call re-prepares.
- Schema introspection (`information_schema`). A dedicated import will
  expose a curated subset.
