---
"@asteby/metacore-runtime-react": minor
---

feat(dynamic-columns): declarative pro cell renderers for dynamic tables

Adds a library of declarative cell renderers so columns are rendered
beautifully out of the box instead of raw text. Driven by `col.cellStyle`
(or `col.type`), resolved via the existing `renderAs = col.cellStyle ?? col.type`.
Config is read from `col.styleConfig`, tolerating both snake_case (kernel) and
camelCase (compiled models).

New cellStyles:

- `url` / `link` — clickable link with an `ExternalLink` icon. `styleConfig`:
  `{ label_field?, url_field?, icon?, new_tab? }`. Shows `label_field` text or
  the URL hostname; opens in a new tab for external URLs (or `new_tab`);
  prefixes `https://` when the scheme is missing.
- `email` — `mailto:` link with a `Mail` icon.
- `currency` — `Intl.NumberFormat` currency formatting, right-aligned.
  Currency from `styleConfig.currency` (default `USD`), decimals from
  `styleConfig.decimals` (default 2). No hardcoded MXN.
- `number` — thousands-separated number, right-aligned.
- `percent` / `progress` — progress bar (shadcn `Progress`) + `NN%` label.
- `badge` (generic) — pills a plain value even without `options`/`searchEndpoint`.
- `status` — badge with semantic color by value (active/paid→green,
  pending/draft→amber, cancelled/failed→red, else grey); explicit
  `options` colors win.
- `tags` — array / comma-separated string → row of small badges.
- `color` — color swatch + hex code.
- `code` / `truncate-text` — monospaced, truncated (`styleConfig.max_length`)
  with a hover copy button.
- `creator` / `user` — avatar + name + subtitle, generalising the existing
  `avatar`/`search` renderer (name from `styleConfig.name_field`, photo from a
  sibling `.avatar`/`.photo` or `base_path + value`, initials fallback).

Also improves the existing `boolean` cell (green `Check` / muted `Minus` icon)
without breaking the `avatar`/`search`, `date`, `phone`, `image`,
`media-gallery`, `badge+options` and `relation-badge-list` renderers.
