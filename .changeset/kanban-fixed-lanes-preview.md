---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): fixed-width lanes (horizontal scroll, no squish) + drag preview matches card

Lanes were `flex-1 min-w-[220px] max-w-[320px]`, so with many stages they compressed
to a cramped width. They're now a fixed `w-[300px] shrink-0` so columns keep a
comfortable width and the board scrolls horizontally instead of squishing. The drag
overlay was a fixed `w-72` that no longer matched the in-lane card; it's now
`w-[284px]` (lane width minus the column padding) so a dragged card is the same size
as it sits in the column.
