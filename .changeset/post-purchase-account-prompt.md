---
"@asteby/storefront-react": minor
---

Nuevo `<PostPurchaseAccountPrompt>` (`@asteby/storefront-react/account`): invitación a crear cuenta en la página de gracias, sin estilos propios (`data-sf-ppa-*`, `classNames`, `locale` es/en, `messages`). Recibe el correo del comprobante de la sesión (campo oculto, no editable), pide solo la contraseña (o el código por correo si la tienda no tiene contraseñas) y reutiliza `createAuthAction` (`register` / `otp-request` → `verify` / `otp-login`), así que la verificación, la cookie de sesión y la no-enumeración de cuentas son las de `<AccountAuth>`. Con verificación de correo, el pedido de invitado con ese correo aparece en «Mis pedidos» al confirmar el buzón.
