---
"@asteby/metacore-ui": minor
"@asteby/metacore-runtime-react": minor
---

Searchable select: a static `select` field with more than 8 options (or `searchable: true`) renders a combobox with a search box instead of a flat dropdown, in `DynamicForm`, `DynamicRecordDialog`, the action modal and line-item cells.

- `runtime-react`: new `SearchableSelectField` (thin configuration of `RecordPicker`), `isSearchableSelect`, `filterSearchableOptions`, `SEARCHABLE_SELECT_THRESHOLD`. Matching is case- and accent-insensitive over label, code (value) and option `description`; matches are highlighted; the list is windowed over 100 rows; optional fields get a clear button; full keyboard and ARIA combobox/listbox support. `ActionFieldDef` / `FieldDef` gain `searchable` (kernel `FieldDef.searchable`, `false` keeps the flat select) and `searchThreshold`; options gain `description`. `RecordPicker` gains `highlightQuery` and 44px touch rows. The multi-select picker now uses the same accent-insensitive filter.
- `ui`: new `normalizeSearchText`, `matchesSearch`, `splitHighlight` (lib). The column-filter value combobox now also matches the visible label (it only matched the raw value), ignoring case and accents.

Backward compatible: short lists keep the flat `Select`; hosts that do not send `searchable` get the combobox only above the threshold.
