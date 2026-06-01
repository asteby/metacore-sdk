---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): rich declarative line-items — column totals, balance rule, pro layout

Makes the declarative form/modal renderer rich enough to replace a custom
federated modal for line-items entry (e.g. a journal entry's debit/credit grid),
driven entirely from the manifest:

- **Totals footer** — any `item_fields` column flagged `total: true` is summed
  across rows and shown in a footer row (`computeLineItemTotals`). Numeric
  columns render right-aligned with `tabular-nums`.
- **Balance rule** — a `type: "array"` field can declare
  `balance: { debit_column, credit_column, message?, require_nonzero? }`. The
  grid shows a live "Cuadrado" / "Descuadre: N" badge and the form blocks submit
  until `Σ(debit_column) === Σ(credit_column)` (and, by default, > 0). Fully
  generic — debit/credit are just the two column keys to reconcile. Typing a
  value into one reconciled column clears its sibling on the same row.
- **Pro layout** — `DynamicForm` flows scalar header fields through a responsive
  2-column grid while line-items grids and textareas span full width, matching
  the look of the hand-written federated journal modal without any custom React.

New pure helpers (`computeLineItemTotals`, `evaluateBalance`, `getBalanceRule`,
`toNumber`) are exported and unit-tested so hosts can reuse the math. Mirrors the
kernel v3 `ActionField.total` / `ActionField.balance` contract additions.
