---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-select): the inline-create "+" no longer overlaps the combobox. The trigger used `w-full` which, in the flex row beside the "+", forced 100% width and overlapped the button in narrow (2-column) modal grids. Use `flex-1 min-w-0` so it grows to fill the space left for the "+".
