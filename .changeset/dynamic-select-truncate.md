---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-select): truncate the placeholder/value so it never overlaps the inline-create "+". The label span lacked `min-w-0`, so a long empty-state placeholder ("Buscar categoría (opcional)…") grew past the trigger and overlapped the "+". Add `min-w-0 flex-1 truncate`.
