# Resend

Envía correos electrónicos transaccionales con Resend. 100 emails/día gratis. Addon metacore **portable v3** — webhook-only: invoca `api.resend.com` con el API key del tenant.

- `key`: `resend`
- `category`: `email`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_email` | POST | `https://api.resend.com/emails` | Envía un correo electrónico a un destinatario |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `resend_api_key` | API Key | password | sí |
| `resend_from_email` | Email remitente | string | no |

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `api.resend.com` | API de envío de correos de Resend |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Crea un API key en [resend.com/api-keys](https://resend.com/api-keys) y pégalo en Settings.
