---
"@asteby/metacore-runtime-react": patch
---

fix(action-modal): render `dynamic_select` action fields as the searchable async picker instead of a plain text input

ActionModalDispatcher's GenericActionModal had its own field renderer that keyed
off `field.type` and had no `dynamic_select` case, so a declarative action field
with `type: "dynamic_select"` (e.g. the Diario/Cuenta pickers of a journal entry)
fell through to a plain text `<Input>`. It now resolves the widget the same way
DynamicForm does (`resolveWidget`) and routes `dynamic_select` to
`DynamicSelectField`, keeping action modals and the standalone form in lockstep.
