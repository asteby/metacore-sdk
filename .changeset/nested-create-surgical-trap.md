---
"@asteby/metacore-ui": patch
---

Replace 2.17.1's modal={false} switch (which dropped Radix's overlay,
pointer/scroll locks and REMOUNTED the dialog content — selects lost
their option labels and showed raw UUIDs) with a surgical focus-trap
release: while an inline-create dialog is open, capture-phase
focusin/focusout listeners on document stop Radix FocusScope from ever
seeing focus moves into the create dialog (marked
data-nested-inline-create via the nestedInlineCreateSelf prop). Parent
dialogs keep full modality, backdrop and state; the child keeps focus.
