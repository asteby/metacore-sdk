---
"@asteby/metacore-runtime-react": minor
---

feat(errors): los toasts de mutación/acción muestran la causa real del servidor

Nuevo helper compartido `toastServerError` / `extractServerError` (`server-error.ts`): en vez de tragarse el `details` y mostrar solo el `message` genérico ("Error creating record"), el toast muestra el `message` como título y el `details`/`errors` de validación como descripción. Cableado en `action-modal-dispatcher` (create/edit/acciones declarativas). Cualquier consumidor puede reusarlo. Así un 500 del kernel (p. ej. un error de Postgres o un guard declarativo) llega legible al usuario/operador.
