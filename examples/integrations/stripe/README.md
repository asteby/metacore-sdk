# Stripe

Consulta pagos y genera links de cobro con Stripe. Addon **tool-only** — sin backend propio: los tools llaman directo a la API de Stripe con la `secret key` almacenada en settings.

## Tools

| id | descripción | params required |
|---|---|---|
| `get_payment` | Busca el estado de un pago/cargo en Stripe por su ID | `charge_id` |
| `create_payment_link` | Genera un link de pago para cobrar un monto específico | `product_name`, `amount_cents` |

## Settings

| key | label | type | required |
|---|---|---|---|
| `stripe_secret_key` | Secret Key | password (secret) | sí |

## Capabilities

- `http:fetch` → `*.stripe.com` — llamadas a la API de Stripe

## Install

El host descarga el bundle del marketplace, valida la firma, y persiste los settings del usuario. No requiere backend propio — los tools llaman directo a la API externa con las credenciales de `settings`.
