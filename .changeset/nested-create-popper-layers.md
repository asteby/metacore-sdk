---
"@asteby/metacore-ui": patch
---

Cover the create dialog's own floating layers in the nested-create
focus guard: Select dropdowns, date-picker popovers and comboboxes
portal to body inside Radix's popper wrapper, OUTSIDE
[data-nested-inline-create] — opening one moved focus "outside" the
marked container, the parent modal's trap yanked it back and the
popover closed on the spot (dates unpickable). While the depth lock is
held, popper-portaled layers count as inside the create flow.
