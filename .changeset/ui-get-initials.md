---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': patch
---

Add `getInitials(name)` helper to `@asteby/metacore-ui/lib`.

Pulls a duplicated 6-line snippet (`name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()`) out of every avatar across the platform — chat headers, profile dropdowns, dynamic-table avatar cells, sidebar nav. Trims whitespace, caps token count, and falls back to a single character when the input is empty.

`runtime-react`'s avatar cell renderer now uses it; visually identical, one less inline lambda.
