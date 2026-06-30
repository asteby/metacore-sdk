---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): cards stretch to fit their content instead of clamping

The card title and field values were `line-clamp-2` (cut to two lines + ellipsis).
Per product feedback the cards should grow DOWNWARD to show their full content and
never cut text. Removed the clamps so title and fields wrap fully (`break-words`
keeps long tokens from overflowing horizontally) and the card grows as tall as it
needs; the column's ScrollArea already scrolls when a lane gets long.
