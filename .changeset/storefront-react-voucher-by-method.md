---
'@asteby/storefront-react': minor
---

La ficha de pago pendiente se alinea con el contrato 1.10 de la API de tienda. Código de barras: si el pago trae `barcode_data` (objeto o `null`) solo se usa eso; un formato que no se sabe dibujar, o `null`, no dibuja barras y muestra el valor como texto («Código»). Ahora se dibujan también ITF y EAN-13 (con dígito de control). `instructions_key` pierde el prefijo `payment.voucher.instructions.` y `other` pasa a `generic`; `kind`: oxxo es efectivo, spei transferencia, other genérico; `paycash` y `bancomer` cuentan como efectivo. El enlace al comprobante del proveedor es `ticket_url ?? voucher_url` (solo https) y la tarjeta lo muestra. Con servidores anteriores (sin `barcode_data`) todo sigue igual: un `barcode` en texto es Code 128.
