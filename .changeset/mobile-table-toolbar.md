---
"@asteby/metacore-ui": patch
---

fix(data-table): responsive toolbar on mobile. The toolbar was a single non-wrapping `justify-between` row, so on a phone the search input plus the Exportar/Importar action buttons overflowed off-screen. It now stacks vertically on mobile (full-width search on top, wrapping action buttons below) and keeps the horizontal layout from `sm` up.
