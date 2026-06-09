---
"@asteby/metacore-runtime-react": minor
---

Add a `reference` display type for SAP-style polymorphic source-document columns.

A column declared `display: "reference"` (e.g. `inventory_movements.source_id`,
whose target document varies by a `source_kind` discriminator) now renders a
navigable chip resolved by the backend. The new `ReferenceCell` reads the
resolved sibling `row[<key w/o _id>] = { value, label, kind, table }`: it shows
the `label` when present, else a short id (first 8 chars of the value), and —
when the sibling carries a target `table` and `value` — wraps the chip in a
plain `<a href="/m/<table>/<value>">` so the host router navigates to the source
document. Mirrors `RelationCell`'s chip look (subtle tint, dark-mode aware) and
is domain-agnostic: any polymorphic FK carrying the `reference` renderer works
without per-addon code.
