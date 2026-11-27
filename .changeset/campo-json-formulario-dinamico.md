---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-form): los campos JSON (columnas jsonb/json/objeto) se editan como JSON y se guardan intactos. Antes el campo «Atributos» de una variante se pintaba como un input de texto con «[object Object]» y fallaba con «Invalid input» (la validación esperaba un texto), así que había que vaciarlo para guardar y se perdía el icono del sabor. Ahora: widget `json` (Textarea monoespaciado con sangría; tipos `json`/`jsonb`/`object` o `widget: "json"`), validación «JSON inválido» sin perder lo escrito, vacío = null, y cualquier campo servido como texto/textarea cuyo valor sea un objeto o arreglo se edita igual y pasa la validación sin alterarse.
