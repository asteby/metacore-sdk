---
'@asteby/metacore-runtime-react': minor
---

Activity/history polish + lucide icon cells:

- `ActivityValueRenderer`: backend-resolved entity objects ({name,avatar,email} users, {value,label} relations) render as an avatar/name chip instead of raw JSON — covers the "Created By" row in a record's history diff. Relation chips also unwrap resolved objects.
- `ActivityDiff`: a diff key now matches dotted display columns by base segment (`created_by` → `created_by.avatar`), inheriting the served label and rich renderer.
- `RecordHistory`: new optional `onOpenEvent(event)` prop — shows an "open in activity log" button per event so hosts can deep-link to `/activity/:id`.
- Image cells (`dynamic-columns` + record detail `ViewValue`): a value that is a lucide icon name (an addon's `icon` column, e.g. "Banknote") renders the glyph via `DynamicIcon` instead of a broken `<img>` (empty grey box). New `isLucideIconName` export.
