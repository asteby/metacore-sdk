---
"@asteby/metacore-ui": patch
---

Release the parent dialog's focus trap while a nested inline-create
sibling is open: 2.17.0's dismiss guards kept the parent OPEN but its
Radix FocusScope (trapped while modal) kept stealing focus back from the
sibling create dialog — which lives in a different React tree, so the
trap treats it as outside — making the form impossible to type into.
Dialogs now reactively drop modality (window-event-backed depth) while
the inline create is open and restore it on close.
