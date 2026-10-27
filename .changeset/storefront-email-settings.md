---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

feat: cambiar y verificar el correo desde la cuenta del comprador (contrato 1.15). `@asteby/storefront`: `customer.email.requestVerification / confirmVerification / requestChange / confirmChange`, `Customer.email_verified` y `CustomerCapabilities.email_change` (opcionales), y el mock los implementa. `@asteby/storefront-react`: `<EmailSettings>` (correo con su estado verificado / sin verificar, pedir un código nuevo, y cambiar el correo en dos pasos: correo nuevo + contraseña o código de acceso al correo actual, luego el código que llega al correo nuevo; el cambio no se aplica hasta confirmarlo), con textos ES/EN, formularios HTML reales, `data-sf-email*` y `classNames`. `createAccountSettingsAction` gana los intents `email-verify-request`, `email-verify-confirm`, `email-reauth-code`, `email-change-request` y `email-change-confirm`; las respuestas son códigos (`invalid_code` nuevo), nunca la contraseña ni el código, y la respuesta de pedir el cambio es la misma tenga o no cuenta el correo nuevo (los textos dicen «si esa dirección puede usarse, te enviamos un código»).
