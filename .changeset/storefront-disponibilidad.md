---
'@asteby/storefront': minor
---

Disponibilidad de inventario (contrato Storefront API 1.1): tipos `Availability`, `AvailabilityStatus`, `CartLineProblem`, `InsufficientStockLine`, `RestockSubscriptionInput`; `availability` opcional en `ProductVariant`, `Product` y `StockLevel`; `CartLine.problem`; `StorefrontError.details` y `.stockLines` para el `409 insufficient_stock`; `client.restock.subscribe()` («Avísame cuando vuelva»). Nuevo `availabilityView(availability, locale)` (textos es/en por clave, sobrescribibles), `resolveAvailability` (polyfill desde `available_for_sale` / `quantity_available` para servidores que aún no mandan `availability`), `cartLineProblemView`, `schemaAvailability` y `productAvailability`. El mock publica `availability`, `CartLine.problem`, el detalle del 409 (con mensaje sin cantidades) y `POST /storefront/restock-subscriptions`; su mensaje del 409 cambió de «Only N available for SKU» a un texto sin cantidades.
