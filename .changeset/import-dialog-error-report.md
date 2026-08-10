---
"@asteby/metacore-runtime-react": patch
---

Fix `ImportDialog` swallowing the real per-row error report when the backend answers a validate/import failure with a non-2xx status (e.g. 422). Previously any non-2xx response fell into a generic "Error al importar los datos" / "Error al validar el archivo" toast, discarding the `data.failures`/`data.errors` detail the backend had already computed. Now the dialog renders that report when present, and only falls back to the generic toast when the response carries no usable payload.
