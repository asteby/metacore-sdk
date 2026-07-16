---
"@asteby/metacore-runtime-react": patch
---

feat(relations): secondary identifier (SKU/email) under a reference chip

Reference chips (resolved FK cells, endpoint-option badges, jsonb line-item refs,
confirm-modal items) now render a muted secondary line under the label — a
product's SKU, a user's email — so a resolved record reads "Name / SKU" instead
of a bare name. Declarative: the SDK reads the backend-projected `subtitle` /
`description` on the option or resolved sibling (never a hardcoded column). Absent
→ single-line as before. The select picker already surfaced `description`; this
brings the resolved-chip surfaces in line.
