---
"@asteby/storefront": minor
---

`customer`: registro y login con contraseña. `capabilities()` (qué admite la tienda: contraseña, verificación por correo, canales OTP), `register()` (devuelve `{ status: 'verification_required' }` o `{ status: 'created', session }`), `verifyRegistration()`, `loginWithPassword()`, `setPassword()` (con `customerToken`) y `resetPassword()`. Tipos nuevos exportados (`CustomerCapabilities`, `CustomerRegisterInput`, `CustomerRegisterResult`, ...). El mock (`@asteby/storefront/mock`) los implementa: capabilities configurable con `customerCapabilities`, código de verificación `000000`, cuentas en memoria y errores 401/403/409/429 representativos (`maxLoginAttempts`).
