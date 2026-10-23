---
'@asteby/storefront-react': minor
---

checkout: `DeliveryOptions layout="flat"` renderiza UNA sola lista de envíos, ordenada de menor a mayor precio, con los servicios repetidos deduplicados (se queda el más barato), las etiquetas más económico / más rápido / recomendado sobre las filas que las ganan, marca de paquetería, servicio, tiempo y precio por fila, sin `<details>` ni grupos, y con la tarifa elegida siempre visible. Nuevo helper `flatRates()`. `list` y `recommended` no cambian.
