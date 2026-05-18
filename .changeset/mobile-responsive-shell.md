---
'@asteby/metacore-ui': patch
---

fix(layout): prevent horizontal overflow on mobile in authenticated shell

The authenticated shell could overflow horizontally on narrow viewports
(~390px), cutting off the search button under the SidebarTrigger and
pushing dashboard cards out of view.

Root causes:

- `SidebarInset` is a flex item but lacked `min-w-0`, so its children
  could expand it beyond the viewport (flex items default to
  `min-width: auto`).
- The `Header` inner row used a fixed `gap-3 p-4` even on small screens,
  and `SidebarTrigger` + `Separator` were not marked `shrink-0`, allowing
  the layout to negotiate widths unpredictably.
- The `headerChildren` wrapper in `AuthenticatedLayout` did not establish
  `min-w-0`, so wide children (e.g. a search button with `w-full flex-1`)
  could push the header beyond the inset.

Fixes are purely stylistic and backward compatible: added `min-w-0` to
`SidebarInset`, the header inner row, and the `headerChildren` wrapper;
tightened mobile padding to `px-3 py-2` (full padding restored at `sm:`);
marked `SidebarTrigger` and the vertical `Separator` as `shrink-0`.
