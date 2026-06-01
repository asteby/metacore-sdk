---
"@asteby/metacore-runtime-react": minor
---

feat(forms): modern date picker, roomy line-items modal, 2-column layout

Three declarative-form polish items, all driven by field shape — zero per-app code:

- **DynamicDateField**: `type: "date"` fields now render a shadcn Calendar inside
  a Popover instead of the native `<input type="date">`. The Popover portals to
  the body so the calendar is never clipped by the modal (fixes the cut-off), and
  it looks modern. The field value stays an ISO `YYYY-MM-DD` string, so payloads
  are unchanged. No future-date restriction (entries can be post-dated).
- **Roomy modal for line-items**: GenericActionModal auto-widens to ~820px when
  the action has a line-items (`type:"array"`) field so the debit/credit grid has
  room; plain forms stay compact. An optional `action.modalWidth` overrides.
  Applied as an inline style so it always takes effect.
- **2-column field layout**: scalar fields (journal, date, reference) flow
  side-by-side instead of one tall vertical stack; line-items grids and textareas
  span full width. Mirrors DynamicForm so the action modal and standalone form
  render identically.
