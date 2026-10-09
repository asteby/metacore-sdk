---
'@asteby/metacore-theme': minor
---

glass.css: el inset flotante respeta el chrome fijo del host mediante `--app-topbar-h`, `--app-notice-h` y `--app-bottombar-h` (default 0, sin cambios si no se definen). Nuevas variables opt-in para que el panel flote en móvil (`--glass-mobile-gutter`, `--glass-mobile-radius`, `--glass-mobile-border-width`, `--glass-mobile-shadow`), `--glass-inset-max-height` y `data-glass-float` para un inset sin sidebar hermano. La hoja del sidebar móvil también descuenta topbar/notice/bottombar.
