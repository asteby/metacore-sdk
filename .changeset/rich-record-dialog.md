---
"@asteby/metacore-runtime-react": minor
---

Consolidate the record dialog into the SDK: tz-aware dates + FK image/label in
view & edit; ops consumes.

`DynamicRecordDialog` (the single, SDK-owned declarative record modal) absorbs
the improvements that had diverged into the ops fork and adds parity-plus:

- **tz-aware dates** — date/datetime/timestamp fields render via the SDK's
  `formatDateCell(value, renderAs, locale, timeZone?)`; a new optional
  `timeZone` prop pins instants to the org IANA zone (pure `date` to UTC) instead
  of hand-rolled `toLocaleDateString`.
- **FK image/label** — relation fields (`ref`/`searchEndpoint`/`dynamic_select`
  or any `*_id`) render a read-only `OptionLead` (thumbnail / icon / color dot) +
  resolved label in **view** mode, and the searchable `DynamicSelectField` picker
  in **edit** mode. Resolution prefers the table-served sibling object, falling
  back to the canonical options endpoint.
- **resolved objects, nil-UUID, created_by avatar** — `{value,label}` / `{name}`
  relation & user objects render their label (never raw JSON); the nil UUID
  elides to an em-dash; `created_by`/avatar resolvers show name + avatar.
- **pro option badges** — enum/option fields render the served color/icon.
- **one_to_many child panels** — `DynamicRelations` (line items, etc.) below the
  scalar fields in view (read-only) and edit (add/edit/delete), skipped on create.
- **instant render** via `initialRecord` seeding, `onOpenFullPage` footer link,
  localized titles/messages, and `onSaved(record)` handing back the persisted row.

New optional props: `getImageUrl`, `timeZone`, `onOpenFullPage`, `initialRecord`.
`onSaved` now receives the persisted record. `ViewValue` and the `FieldDef` /
`FieldOption` / `GetImageUrl` types are exported so hosts can reuse the view
renderer (e.g. a full detail page). Fully backward compatible.
