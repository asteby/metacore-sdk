---
'@asteby/metacore-runtime-react': patch
'@asteby/metacore-ui': patch
'@asteby/metacore-starter-core': patch
---

Kanban responsive board + cards truncate; sidebar nav lights the default view on a view-less landing

Two frontend UX fixes reported against the ops board.

**Kanban now adapts instead of overflowing (`@asteby/metacore-runtime-react`).**
`DynamicKanban` lanes were fixed-width (`w-72 shrink-0`), so with 4+ stages the
last lane was clipped off-viewport and long card text was cut by the card edge
with no ellipsis. Lanes are now responsive — `flex-1 min-w-[220px] max-w-[320px]`
— so they shrink to fit the available width and only scroll horizontally when
they genuinely can't fit. Card titles now `line-clamp-2 break-words` and the
secondary field rows carry `min-w-0` so long values ellipsize *inside* the card
rather than being clipped by the border. The optimistic drag-to-move (PUT
`<base>/<id>`) is untouched.

**Sidebar nav active-state on the default/view-less landing (`@asteby/metacore-ui`,
`@asteby/metacore-starter-core`).** Landing on a model's bare list surface
(e.g. `/m/github_issues?per_page=15` — a transient param, no `view`) lit
*neither* the "Tablero" (`?view=kanban`) nor the "Issues" (`?view=list`) nav
item, because the empty view bucket matched neither sibling's explicit view.
`checkIsActive` now treats the empty/`view=list`/`view=table` buckets as
"default-equivalent": a view-less current URL lights the list/default item while
the board (`?view=kanban`, never a default bucket) stays mutually exclusive. The
prior Board-vs-Issues exclusivity, `f_` filter and transient (page/sort/search)
behaviour are all preserved (18 matcher tests, +4 new). Ported to the
`starter-core` scaffold's embedded copy for parity.
