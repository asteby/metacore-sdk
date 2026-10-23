---
"@asteby/storefront-react": patch
---

fix(pago): el formulario incrustado de Mercado Pago oculta su propio encabezado (`visual.hideFormTitle`). Mostraba "Tarjeta de crédito o débito" y las banderas de tarjetas aceptadas, que repiten lo que la tienda ya enseña en su fila de método de pago, y las banderas se veían cortadas (AMEX partido en dos líneas) al estrecharse el contenedor.
