# SendGrid

Envía correos transaccionales con SendGrid de Twilio. Addon metacore **portable v3** — webhook-only: invoca `api.sendgrid.com` con el API key del tenant.

- `key`: `sendgrid`
- `category`: `email`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_email` | POST | `https://api.sendgrid.com/v3/mail/send` | Envía un correo electrónico vía SendGrid |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `sendgrid_api_key` | API Key | password | sí |
| `sendgrid_from_email` | Email remitente | string | no |

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `api.sendgrid.com` | API de envío de correos de SendGrid |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Genera un API key en [app.sendgrid.com](https://app.sendgrid.com/settings/api_keys) y pégalo en Settings.
