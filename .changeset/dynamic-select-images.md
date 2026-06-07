---
'@asteby/metacore-runtime-react': patch
---

Relation/option thumbnails: resolved FK relation chips and option badges now
render a small thumbnail when the backend stamps an `image` on the sibling
`{ value, label }` object or the option (brand logo, product photo, customer
avatar), with a graceful initials fallback when the image is missing or fails to
load. Applies to the table `relation`/`select`/`status`/`badge` cells; the
searchable picker (`DynamicSelectField`) and the detail-view picker already
rendered option images. Adds a pure `resolveRelationImage` helper (+ tests).
