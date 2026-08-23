---
"@asteby/metacore-runtime-react": patch
---

Fix relation/brand thumbnails (RelationCell) being cropped: switch from
`object-cover` to `object-contain` on a padded neutral background so
wide/rectangular logos (brand, supplier, category images) render in full
instead of clipped to a square.
