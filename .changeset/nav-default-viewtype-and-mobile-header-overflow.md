---
'@asteby/metacore-ui': patch
'@asteby/metacore-starter-core': patch
---

Nav active-state resolves a view-less URL to the model's real default view_type; new responsive `HeaderActions` overflow for the mobile header

**Sidebar nav: view-less landing now lights exactly the right sibling.** The
previous fix (2.6.1) hardcoded "no `?view`" as the list/table surface
(`DEFAULT_VIEW_BUCKETS`), which is wrong for a model whose default `view_type`
is `kanban`: landing on `/m/github_issues?per_page=15` (no `?view`, but it
RENDERS the board because the model default is kanban) could light BOTH the
"Tablero" (`?view=kanban`) and the "Issues" (`?view=list`) nav items. The
matcher now resolves an absent `?view=` to the **model's actual default
view_type** (mirroring `DynamicView.resolveActiveView`), so a view-less URL
lights the board on a kanban-default model and the list on a list-default model
— never both, never the wrong one. Explicit `?view=kanban`/`?view=list` URLs
match their item directly.

- `checkIsActive(href, item, mainNav?, defaultView?)` gains an optional
  `defaultView` (the model's `view_type`). `NavLinkItem` gains an optional
  `defaultView` field; `NavGroup` threads it into every `checkIsActive` call.
  Hosts populate it from `metadata.view_type`. Omitted → an absent `?view`
  resolves to `''` (a view-less URL only matches a view-less item, never two
  explicit-view siblings). Ported to the `starter-core` scaffold copy.
- Tests: 21 matcher cases (covers default=kanban → only board, default=list →
  only list, explicit `?view=kanban`/`?view=list`, and the no-default fallback).

**Mobile header overflow (`HeaderActions`).** On phones the secondary header
toggles (search, dark-mode, print, settings, update badge, notifications…)
overflowed and looked cramped. New `HeaderActions` component (exported from
`@asteby/metacore-ui/layout`): renders its children inline on `sm:`+ and, below
`sm`, collapses them into a single kebab overflow trigger that opens a popover
with the toggles stacked. A pending count bubbles onto the trigger via
`overflowBadge` so notifications stay visible while collapsed. Purely
Tailwind-driven (`hidden sm:flex` / `flex sm:hidden`) — no resize listeners; a
Popover (not a DropdownMenu) hosts the overflow so toggles that open their own
menus still work. Hosts wrap their `headerChildren` with `<HeaderActions
overflowBadge={…}>…</HeaderActions>`; the avatar stays a sibling outside it.
