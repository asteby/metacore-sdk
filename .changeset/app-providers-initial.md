---
"@asteby/metacore-app-providers": minor
---

Nuevo paquete `@asteby/metacore-app-providers` — providers genéricos extraídos de ops y link.

Incluye: `DirectionProvider` (LTR/RTL + Radix), `FontProvider` (font class en html, fonts list injectable), `LayoutProvider` (sidebar variant/collapsible), `SearchProvider` (command palette hotkey). Utilidades `getCookie`/`setCookie`/`removeCookie` exportadas para consumidores.

Todos los providers persisten en cookies. Reemplaza las copias locales duplicadas en ops/frontend y link/frontend.
