---
"@asteby/metacore-theme": minor
---

Nuevo `@asteby/metacore-theme/glass.css`: el tema glass (`<html data-ui-theme="glass">`) como hoja genérica sobre los `data-slot` de `@asteby/metacore-ui`. Sidebar e inset son paneles flotantes con borde hairline, brillo interior arriba, sombra en capas, blur y saturación, y funciona con el sidebar colapsado, con la sheet móvil y con las variantes `sidebar`/`floating`/`inset`. Diálogos, sheets, popovers, selects y menús usan vidrio denso con overlay difuminado. Los inputs tienen fondo translúcido y foco con el color de marca. Las tablas llevan header translúcido con blur, hover sutil en filas y celdas sticky legibles. Nunca define `--primary`: el acento es siempre el de la marca. Incluye fallback casi opaco sin `backdrop-filter` y con `prefers-reduced-transparency`, más modo oscuro.
