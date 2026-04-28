---
'@asteby/metacore-runtime-react': patch
---

Fix DynamicTable horizontal scrollbar appearing mid-card.

`<Table>` from `@asteby/metacore-ui` ships its own `overflow-x-auto` wrapper sized to content height. Combined with DynamicTable's outer `flex-1 min-h-0 overflow-auto` card, the inner scrollbar drew at the bottom of the rendered rows (mid-card) instead of pinned to the card's bottom edge — wide tables felt visually broken when there were few rows.

Pass `noWrapper` to opt out of shadcn's inner wrapper. The outer SDK wrapper now owns the scroll; horizontal scrollbar pins to the bottom of the card as expected.
