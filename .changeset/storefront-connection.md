---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

storefront: conexión de la tienda con OPS. `StorefrontError.requiredScopes` y el código `insufficient_scope` (403), `client.token.introspect()` (GET /api/gw/_token), `diagnose(client)` (un aviso con la ruta de reparación si faltan alcances; nunca lanza ni imprime el token completo), `token` del cliente acepta `() => string`, y la subruta `@asteby/storefront/node` con `storefrontTokenFromEnv()` / `createFileTokenSource()` (`STOREFRONT_TOKEN_FILE`, `$CREDENTIALS_DIRECTORY/storefront_token`, relectura cada 30 s por mtime) y `connectStore().keepFresh()` (latido y rotación). Nuevo binario `npx @asteby/storefront connect --ops <url>` que canjea el código de conexión por TTY y escribe la clave de forma atómica con modo 0600. `CustomerCapabilities.unavailable_reason` / `missing_scopes`; el mock acepta `missingScopes`.

storefront-react: `AccountAuth` y `createAuthAction` distinguen `store_misconfigured` (la credencial de la tienda no tiene permisos: mensaje es-MX al comprador y log en el servidor con la ruta de reparación) de `unsupported`; `loadAuthCapabilities` respeta `password:false` por falta de alcance.
