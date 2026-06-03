---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-form): basic `select` fields fill their column (`w-full`). shadcn's SelectTrigger defaults to `w-fit`, so enum/option selects shrank to their content instead of lining up with text inputs and FK comboboxes. Applies to both the plain `select` renderer and `RefSelect`.
