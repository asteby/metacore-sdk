---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): card "…" actions (Ver / Editar / Eliminar / custom) now work and are permission-gated

The per-card kebab menu on the kanban board forwarded the raw action object to a
no-op, so clicking Ver/Editar/Eliminar did nothing, and the menu was not filtered
by permission. The dispatch logic was extracted from `DynamicTable` into a shared
`useDynamicRowActions` hook (delete-confirm dialog, view/edit → host `onAction`
string contract or the built-in record dialog, link → navigate, custom →
ActionModal) that both renderers now use, so a kanban card behaves identically to a
table row. The card actions are resolved through the new `resolveRowActions` helper
— the same capability gate (`useCan`/`gateTableMetadata`) and implicit View/Edit/
Delete trio materialization the table's action column uses — so an action the user
lacks permission for no longer appears. `DynamicKanban` gains an optional
`onAction(action: string, row)` prop mirroring `DynamicTable`.
