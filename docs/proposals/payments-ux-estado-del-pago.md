# Propuesta: estado del pago consumible por la UI (adenda a RFC-PAYMENTS-STANDARD)

Estado: propuesta. El SDK (`storefront-react`) ya funciona SIN estos campos (degradación elegante); con ellos la UI sería exacta. Nada de esto se implementa en este PR (ni kernel, ni OPS, ni addons).

## Qué consume hoy la UI (ya existe)

| Necesidad | Campo existente |
|---|---|
| Reto bancario pendiente | `payment.status = requires_action`, `payment.outcome = challenge`, `payment.action.challenge.url` |
| Rechazo con motivo | `payment.status = failed` + `decline_code` (10 códigos neutros del kernel), `next_step`, `retryable`, `attempts_left` |
| Ventana de bloqueo | `checkout.pay_blocked_until` (RFC 3339) en `/pagar/estado` y `payment-config` |
| Reserva de stock | `checkout.stock_hold_expires_at` |
| Sugerencia de reintento | `next_step` (`retry`, `fix_card_data`, `use_other_card`, ...) |

El addon `mercadopago` (`backend/wasm/mpcheckout/decline.go`) mapea `status_detail` a `decline_code` (p. ej. `cc_rejected_3ds_challenge`, `3ds_challenge_expired`, `3ds_challenge_failed` -> `authentication_failed`; todo lo desconocido y los rechazos de riesgo -> `declined`) y `pending_challenge` -> `requires_action`. La UI nunca lee `status_detail` crudo.

## Qué falta (propuesta)

1. `payment.action.challenge.expires_at` (RFC 3339): cuándo caduca el reto en el banco. Hoy la UI usa un límite local (3 min).
2. `payment.failure_reason`: código estable para fallos que NO son rechazo de tarjeta: `challenge_expired`, `challenge_abandoned`, `challenge_failed`, `provider_unavailable`. Hoy un reto fallido de MP queda `requires_action` mientras la página del banco muestra su error; la UI solo se entera por tiempo.
3. `payment.charged`: `true | false | "unknown"`: si el proveedor llegó a cobrar. Hoy la UI solo puede decir «no vuelvas a pagar» y «si ves un cargo, contáctanos».
4. `checkout.retry_after_seconds` junto a `pay_blocked_until` (evita desfase de reloj del cliente) y `pay_blocked_reason` (`challenge_open`, `payment_in_progress`).
5. Que los errores 409/429 por bloqueo lleven `details.pay_blocked_until` (hoy la UI solo lo lee de respuestas de estado).

## Ejemplo

```json
{
  "checkout": { "id": "…", "status": "pending", "pay_blocked_until": "2026-11-17T18:30:00Z", "retry_after_seconds": 900, "pay_blocked_reason": "challenge_open" },
  "payment": {
    "provider": "mercadopago", "status": "requires_action", "outcome": "challenge",
    "failure_reason": null, "charged": "unknown",
    "action": { "type": "challenge", "challenge": { "url": "https://…", "expires_at": "2026-11-17T18:03:00Z" } }
  }
}
```

## Compatibilidad

Todos los campos son opcionales y aditivos; clientes que no los conocen los ignoran. El SDK usará `expires_at` como límite del reto si existe (si no, `challengeTimeoutMs`) y `failure_reason`/`charged` para afinar textos.
