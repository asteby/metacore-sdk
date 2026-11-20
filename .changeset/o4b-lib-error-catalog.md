---
"@asteby/metacore-lib": minor
---

`getApiErrorMessage(err, fallback, { lang })` consulta un catalogo de errores por `code` (con `{param}`) antes de caer a `message`. Nuevo `registerErrorCatalog`, `translateErrorCode` y el catalogo es/en del kernel (`kernelErrorCatalog`).

Soporta el formato real del kernel: errores de validacion 422 `{errors:{<col>:[{code,params,message?}]}}` y cuerpos planos `{code,message}`. Nuevo `getApiFieldErrors(err, {lang})` (columna -> mensajes traducidos).
