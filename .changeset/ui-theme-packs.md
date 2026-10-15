---
'@asteby/metacore-theme': minor
---

Moves the UI theme packs out of ops into the shared theme package: `ui-themes.css` (all 13 packs incl. glass + font/density/radius axes), `applyUiTheme` / `applyCachedUiTheme` / `paintLiveDesign` / `UI_THEME_PACKS`, a `setUiThemeBrandPainter` hook so the host decides how the brand accent is painted, and a `UiThemePicker` component to choose a pack.
