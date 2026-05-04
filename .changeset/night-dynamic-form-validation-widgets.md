---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): `DynamicForm` aplica `Validation` (regex/min/max) al schema zod generado y soporta widgets `textarea`/`richtext`/`color`.

- `ActionFieldDef` extendido con `validation?: FieldValidation` (regex/min/max/custom — espejo del `ValidationRule` del manifest del kernel) y `widget?: FieldWidget | string`.
- `DynamicForm` ahora deriva un schema zod por field y valida en el submit, mostrando errores inline en lugar del `alert()` previo. Min/max aplica como longitud para strings y como bound para numéricos (mismo dual semantics que el kernel). Regex malformada del manifest se ignora silenciosamente para no tirar el render.
- Nuevo export `buildZodSchema(fields)` para que callers reutilicen el mismo schema fuera del form.
- Renderer mapea widgets explícitos a primitivos de `@asteby/metacore-ui`:
  - `textarea` → `Textarea`
  - `richtext` → `Textarea` con `data-widget="richtext"` (puente hasta que aterrice un primitivo MDX/rich; mantiene el contrato sin romper consumers).
  - `color` → `Input type="color"`.
- Backwards compat: zero-value (sin `validation`/`widget`) preserva el comportamiento previo (widget inferido por `type`, sin reglas de validación más allá de `required`).
