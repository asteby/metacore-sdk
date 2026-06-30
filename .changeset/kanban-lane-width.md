---
'@asteby/metacore-runtime-react': patch
---

fix(kanban): constrain cards to the lane width so they stop spilling out of the stage

The lane used a Radix ScrollArea whose viewport wraps content in a `display:table`
element that shrink-to-fits the widest card. Once card text wrapped freely (no
line-clamp) the cards grew to their natural content width and overflowed the
column. Replaced the ScrollArea with a plain `overflow-y-auto` block and gave the
card `w-full min-w-0`, so every card fits the lane and its text wraps inside it.
