---
'@asteby/metacore-ui': minor
---

NavGroup: nav items now accept a numeric `badge` (`badge?: number | string`),
rendered as a small pill to the right of the label. A numeric `0` is treated as
"no badge" and renders nothing, so consumers can pass a raw count without
guarding the falsy-zero JSX case. Works on link, collapsible and collapsed
dropdown items.
