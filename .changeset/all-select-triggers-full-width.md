---
"@asteby/metacore-runtime-react": patch
---

fix: every basic `select` field fills its column (`w-full`). shadcn's SelectTrigger defaults to `w-fit`, so enum/option selects shrank to their content instead of aligning with text inputs and FK comboboxes. Covers the declarative action modal (`ActionModalDispatcher`), the record dialog, and line-item rows — the actual renderers behind a model's `placement:create` modal.
