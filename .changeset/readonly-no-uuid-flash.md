---
"@asteby/metacore-runtime-react": patch
---

fix(line-items): a locked dynamic_select no longer flashes the raw id while its label is resolving — it shows a loading hint, then the name + thumbnail, instead of String(value).
