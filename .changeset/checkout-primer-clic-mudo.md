---
'@asteby/storefront-react': patch
---

Checkout con Stripe: el primer clic en PAGAR tras cambiar el total (p. ej. al elegir tarifa de envio) ya no se queda mudo. `elements.update` se espera antes de leer el formulario y, si `elements.submit()` o `createConfirmationToken` fallan por una condicion transitoria (Stripe aun sincronizando, no un error de campos), se relee UNA vez; los errores de campos o de tarjeta se muestran de inmediato sin releer. Ademas, un clic que no encuentra formulario utilizable (`idle`, o `ready` antes de que el formulario este entregado) espera brevemente al formulario o muestra un error visible en lugar de no hacer nada.
