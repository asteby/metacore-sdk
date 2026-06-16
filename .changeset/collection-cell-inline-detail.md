---
"@asteby/metacore-runtime-react": minor
---

The read-only record detail view now renders jsonb line-items with the same pro
rendering as the table instead of raw `JSON.stringify`. `CollectionCell` gains a
`variant?: 'badge' | 'inline'` prop (default `'badge'` = unchanged behaviour);
`'inline'` renders the mini-table / pair-list / scalar-list directly, with no
badge or popover, for the full-width detail dialog. The detail view's
`StructuredViewValue` delegates to `<CollectionCell variant="inline" …>`,
threading the field's `item_fields` schema plus locale + translator: an
`item_fields` schema drives localized headers + resolved ref labels (the
injected `{ value, label }` sibling — product name instead of the raw uuid),
and without a schema it falls back to a localized mini-table / pair list. The
"—" empty marker is preserved.
