---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-ui': minor
---

Make declarative dynamic-table option badges and relation chips feel alive.

Options/select/status badges that ship without an explicit `color` from the
backend now get a deterministic, cohesive color derived from the option value
(fallback label) instead of rendering as dead gray text. Same value always maps
to the same hue, and equal words share a color.

- `@asteby/metacore-ui/lib` adds `optionColor(key)` (curated 16-hue Tailwind-500
  palette, FNV-1a hash, light/dark safe), plus `optionColorBadgeStyles`,
  `relationChipStyles`, and the exported `OPTION_PALETTE`.
- `OptionBadge` uses the explicit `color` when present, otherwise derives one via
  `optionColor`, and renders the option's lucide `icon` before the label.
- `RelationCell` (resolved FK chips for category/brand/supplier/…) now gets a
  subtle deterministic color keyed on the related label — kept lighter than enum
  badges (soft tint, no heavy fill) so the two remain distinguishable.

All colors come from hex-derived inline styles, so they render correctly
regardless of the host's tailwind safelist.
