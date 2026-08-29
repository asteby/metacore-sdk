---
"@asteby/metacore-notifications": patch
---

Derive a deterministic notification id (ntf:<event>:<record_id> from the
payload metadata) before falling back to randomUUID in ingestWsPayload —
the same notification arrives over both WS and SSE by design, and the
random fallback on one path made seenIdsRef unable to collapse the pair,
rendering every declarative notification twice.
