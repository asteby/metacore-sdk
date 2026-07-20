---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': minor
---

Relation avatars render monochrome instead of one color per row.

`InitialsAvatar` gains a `tone` prop. `auto` (the default, unchanged) keeps the
per-name palette hash, which is meaningful for a small stable value set such as
a category or a status. The three relation surfaces — the dynamic-table relation
cell, the select options and the read-only detail dialog — now pass `neutral`,
which paints every imageless avatar the same muted surface. For open-ended
references like products or warehouses the derived color carried no meaning and
a listing rendered as a rainbow. Records that have an image are unaffected.
