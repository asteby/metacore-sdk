---
"@asteby/storefront-react": minor
"@asteby/storefront": patch
---

Modal de la verificación del banco (3DS): el botón de salida ya no se recorta en pantallas bajas (el iframe cede alto y la salida siempre se ve), aparece a los 20 s por defecto en lugar de 120 s (cerrar nunca cancela ni repite el pago; el hook sigue verificando con el banco, así que una página 5xx del banco no atrapa al comprador) y su texto es accionable: "¿La página del banco muestra un error o tarda demasiado? Puedes cerrarla… nunca se cobra dos veces." (es/en). El alto mínimo del iframe pasó del estilo en línea (420 px) al CSS (`min(26rem, 45dvh)`).
