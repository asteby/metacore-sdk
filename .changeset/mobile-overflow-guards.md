---
'@asteby/metacore-ui': minor
---

Guardas móviles (PR S-1 del plan UI/UX móvil): `SidebarInset` y el `<main>` de `AuthenticatedLayout` recortan el desborde horizontal (`overflow-x-clip`, `min-w-0`) para que una fila ancha ya no arrastre el header; `Button` amplía su área táctil a 44px con `pointer: coarse` sin cambiar su aspecto; `HeaderActions` acepta `overflowBadge="dot"`; se exporta `MOBILE_BREAKPOINT` desde `hooks`.
