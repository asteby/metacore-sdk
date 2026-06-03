---
"@asteby/metacore-app-providers": minor
---

fix(branding): readable, neutral theming for dark/grey brand colors

`generateThemeVars` had two gaps that made a dark or greyscale tenant brand
break in dark mode:

- **Achromatic brands tinted the whole UI.** A grey brand (e.g. `#2b2b2b`)
  has no real hue, so `hexToOklch` returned float noise (h≈90). The surfaces
  applied their fixed chroma at that bogus hue, painting every panel a random
  warm/sepia (or purple) cast. Now a near-grey brand (`C < 0.02`) collapses
  hue and surface chroma to 0 → a cleanly neutral theme.
- **`--primary`/`--sidebar-primary` foreground was hardcoded white.** A
  light-grey primary in dark mode got invisible white text. Foregrounds are
  now auto-derived per WCAG contrast (`readableForeground`), so text stays
  legible on any brand surface in either mode. `--primary-foreground` is now
  owned by the branding system (added to `BRANDED_KEYS`).

Also: empty/whitespace branding fields from the API no longer overwrite the
defaults (or skip branding entirely and drop back to the unstyled fallback
theme) — both the provider merge and `applyBranding` now treat blank strings
as "not provided".
