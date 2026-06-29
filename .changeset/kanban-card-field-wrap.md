---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): wrap long card field values to 2 lines + ellipsis instead of a 1-line hard cut

Kanban card fields rendered each value on a single `truncate` line, so a long
text field — e.g. a github Issue whose title lands in a *field* because the first
text column (`repo`) is picked as the card title — was hard-cut mid-line and lost
most of its content. Field values now `line-clamp-2 break-words`, so they grow to
two lines and then ellipsis cleanly, matching the title's treatment.
