---
'@asteby/metacore-runtime-react': patch
---

fix(dynamic-table): preserve `view`/`group_by` in the URL when the table syncs its state

The table's url-sync rebuilt the query string from scratch (only its own
page/sort/filter keys) and `replaceState`d it, wiping the route-owned
`view`/`group_by` params. On a same-model board↔list pair (e.g. github's Board
`?view=kanban` vs Issues `?view=table`) this stripped `?view` on mount, so the
URL went bare and the sidebar active-state fell back to the model default —
highlighting the wrong sibling until you clicked again. The sync now carries
`view`/`group_by` through so the open entry stays highlighted on a single click
and `?view` deep-links survive table interaction.
