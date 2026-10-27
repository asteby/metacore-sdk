---
"@asteby/storefront-react": patch
---

fix(storefront-react): `<AccountAuth>` ya no vuelve al paso del código al cambiar de pestaña. Con un formulario que se remonta (p. ej. las pestañas «Inicia sesión» / «Crea tu cuenta» del pago) el último resultado de la acción (`useActionData()`, mismo objeto hasta el siguiente envío) volvía a imponer `step: 'verify'`. Ahora «Usar otro correo», «Volver a entrar con contraseña» o cualquier cambio de vista descarta ese resultado y limpia todo el estado pendiente: paso, error, aviso, cuenta regresiva y la contraseña guardada en memoria para reenviar.
