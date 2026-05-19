---
'@asteby/metacore-app-providers': patch
---

fix(branding): clear stale CSS vars when toggling light/dark mode

`generateThemeVars` wrote 14 CSS custom properties in dark mode but only
8 in light, and `applyThemeVars` only ever called `setProperty` — never
`removeProperty`. As a result, switching from dark to light left
`--background`, `--card`, `--popover`, `--muted`, `--input`,
`--sidebar-accent`, `--sidebar-border` pinned to their dark-mode values
on `<html>.style`, producing the fluorescent-chrome-on-black look in
light mode that the auth shell, sidebar and chat widget were exhibiting.

Two fixes:

- Dark and light branches now write the same symmetric set of branded
  keys (declared in a single `BRANDED_KEYS` source of truth), so
  toggling modes can't leak stale values from the previous mode.
- `applyThemeVars` removes any branded key that isn't in the new
  payload before writing — so even with stale localStorage caches
  or partial branding payloads, the inline style on `<html>` is
  always coherent with the active mode.
