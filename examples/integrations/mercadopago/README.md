# MercadoPago

Consulta cobros y genera links de pago con MercadoPago. Ideal para LATAM. Addon **tool-only** — sin backend propio: los tools llaman directo a la API con el `access token` de la instalación.

## Tools

| id | descripción | params required |
|---|---|---|
| `get_payment` | Consulta el estado de un pago en MercadoPago | `payment_id` |
| `create_payment_link` | Genera un link de checkout para cobrar un monto | `title`, `amount` |

## Settings

| key | label | type | required |
|---|---|---|---|
| `mercadopago_access_token` | Access Token | password (secret) | sí |

## Capabilities

- `http:fetch` → `*.mercadopago.com` — llamadas a la API de MercadoPago

## Install

El host descarga el bundle del marketplace, valida la firma, y persiste los settings del usuario. No requiere backend propio — los tools llaman directo a la API externa con las credenciales de `settings`.
