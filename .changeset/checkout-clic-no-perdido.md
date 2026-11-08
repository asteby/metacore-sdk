---
"@asteby/storefront-react": minor
---

useEmbeddedPayment: un clic en PAGAR mientras el formulario se prepara (carga del SDK o remontaje tras cambiar entrega o total) ya no se pierde en silencio: se guarda y el cobro sale solo cuando el formulario está listo, una sola vez; si el formulario no llega a estar disponible se descarta sin tocar al servidor. El estado expone `preparing` para mostrar "preparando" en el botón. Además, si la respuesta del cobro tarda más de `slowSubmitMs` (12 s) y el transporte tiene `refresh`, el hook consulta al servidor cada `slowSubmitPollMs` (3 s) y termina con el resultado en cuanto el servidor reporta el pago resuelto, en lugar de dejar al comprador en "confirmando" mientras la petición lenta termina.
