---
"@asteby/storefront-react": minor
---

`/checkout`: piezas nuevas para el formulario de pago, sin cambiar nada de lo existente. `ContactFields` y `AddressFields` (orden y `autocomplete` correctos, colonia y referencias como campos propios `neighborhood`/`reference` de la API, código postal primero con formato, estados y consulta por código postal puestos por la tienda; nada de país escrito en el SDK). `useFieldErrors` + `CheckoutField` + `ErrorSummary`: validación en línea con las reglas del HTML, texto del error bajo el campo, resumen enfocable al enviar y errores del servidor; sin JavaScript valida el navegador. `OrderSummary` (totales de `cart.cost` tal cual, envío pendiente/actualizando/gratis, impuestos incluidos como nota) y `OrderSummaryDisclosure` (resumen plegable para teléfono con el total, `<details>` nativo sin salto al hidratar). Estilos base en `checkout.css`.
