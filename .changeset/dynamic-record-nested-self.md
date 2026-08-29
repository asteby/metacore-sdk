---
"@asteby/metacore-runtime-react": patch
---

DynamicRecordDialog exposes nestedInlineCreateSelf and threads it to the
ui Dialog, so the host's inline-create bridge can mark the sibling
"Crear" dialog as the nested-create self (data-nested-inline-create for
the surgical focus release; the body guard lets it close via Esc/X
while the depth lock is held).
