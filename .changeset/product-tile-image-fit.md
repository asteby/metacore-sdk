---
"@asteby/metacore-ui": minor
---

`ProductTile`: add `imageFit?: 'cover' | 'contain'` (default `'cover'`, unchanged). Use `'contain'` for catalog photos not pre-cropped to the tile's 4:3 box (a round tire shot, a logo, packaging on white) — `'cover'` was slicing off the edges of those images in till grids (POS, purchases).
