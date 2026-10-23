---
'@asteby/storefront': patch
---

storefront: `connect`, `connectStore` y `token.introspect()` se ajustan al contrato real de OPS. Respuestas en el sobre `{success,data}` (también acepta la forma plana); errores `{success:false,error,message}`. Petición con `client:{name,version,runtime,hostname}`; la respuesta de redeem trae `token`, `connection`, `scopes`, `rotation_days` y `api_base` (que se usa como base del cliente). El latido rota con `rotate_now` o `next_rotation_at`, respeta `Retry-After` en 429 y el estado `<archivo>.json` guarda conexión, `api_base`, `rotation_days` y `rotate_after`. Se elimina `--site` de la CLI.
