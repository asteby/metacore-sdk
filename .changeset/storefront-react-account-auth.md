---
"@asteby/storefront-react": minor
---

Pantalla de cuenta compartida: `<AccountAuth>` (`/account`, con `account.css` opcional) y, del lado servidor, `loadAuthCapabilities(sf)` (caché corta, degrada a `{ password: true, email_verification: false, otp_channels: [] }`) y `createAuthAction({ storefront, customerCookie, safeNext })` (`/account/server`) para entrar con contraseña, crear cuenta, verificar el código, entrar con código y recuperar la contraseña. Las tiendas solo conectan loader, action y componente. Requiere `@asteby/storefront` con los métodos de contraseña de `customer`.
