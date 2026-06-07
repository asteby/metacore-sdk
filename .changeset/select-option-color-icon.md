---
'@asteby/metacore-runtime-react': patch
---

`DynamicSelectField` (the searchable FK / option picker) now renders each
option's leading visual: a photo thumbnail (FK relations with an image), else a
declared icon, else a colored dot for enum/status options that carry a `color`.
Previously only image thumbnails showed, so enum selects (state, origin, …) read
as plain text. Plain options with no image/color/icon stay plain.
