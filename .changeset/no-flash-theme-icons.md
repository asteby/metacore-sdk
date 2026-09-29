---
"@asteby/metacore-theme": minor
"@asteby/metacore-ui": minor
"@asteby/metacore-app-providers": patch
"@asteby/metacore-runtime-react": patch
---

Recargar ya no parpadea ni mueve nada por el tema o los íconos.

- theme: `@asteby/metacore-theme/boot` con `themeBootScript()`, un script inline para el inicio de `<head>` que vuelve a pintar, antes del primer frame, el tema que el usuario vio la última vez (claro/oscuro, `data-ui-*`, clases `font-*`, variables de marca y la hoja de superficies). En la primera visita sigue `prefers-color-scheme`. `ThemeProvider` guarda ese estado (`persistBoot`, activo por defecto) y reactiva las transiciones cuando monta; no toca `<html>` si la clase ya es la correcta.
- ui: registro de glifos compartido en `@asteby/metacore-ui/icons` (`Glyph`, `getGlyph`, `loadGlyph`, `preloadGlyphs`, `registerGlyphs`). Un glifo visto antes se dibuja en el primer render desde localStorage, cada nombre conserva un solo componente y, mientras uno nuevo carga, `<Glyph>` ocupa su tamaño con un `<svg>` vacío. `resolveIconName` usa el mismo registro.
- runtime-react: `DynamicIcon` dibuja con `Glyph`, así que las acciones de tabla y los menús ya no aparecen sin ícono para después empujar el texto, tampoco al volver a abrir un menú. Los nombres con dígito (`Trash2`, `Building2`) resuelven su glifo. `DynamicTable` precarga los íconos de las acciones al recibir la metadata.
- app-providers: mientras `/org/branding` responde, `PlatformConfigProvider` usa la marca cacheada, no los defaults, y solo vuelve a pintar los tokens cuando cambia claro/oscuro; aplicar la marca o la fuente no escribe en `<html>` si el valor no cambió.
