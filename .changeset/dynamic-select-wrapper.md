---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-select): constrain the combobox+"+" row to its grid cell. The wrapper lacked `w-full min-w-0`, so in a 2-column form the row sized to its content (the long empty-state placeholder) and overflowed the column, pushing the inline-create "+" off-screen — it only fit once a short value was selected. Add `w-full min-w-0`.
