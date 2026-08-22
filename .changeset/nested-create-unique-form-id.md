---
"@asteby/metacore-runtime-react": patch
---

Crear una categoría (u otro registro) desde el "+" de un modal ya no
valida el formulario de atrás. Cada diálogo tiene su propio `form` id, y
el toast de validación lista los mensajes del validator.
