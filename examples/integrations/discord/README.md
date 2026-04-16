# Discord

Envía alertas y notificaciones a canales de Discord. Addon metacore **portable v3** — webhook-only: el host reenvía la llamada al Channel Webhook configurado por el admin.

- `key`: `discord`
- `category`: `communication`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_message` | POST | `{{discord_webhook_url}}` | Envía un mensaje a un canal de Discord |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `discord_webhook_url` | Webhook URL | password | sí |

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `discord.com` | API oficial de Discord |
| `http:fetch` | `discordapp.com` | Dominio legado de webhooks Discord |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Tras instalar, pega el Channel Webhook URL del servidor Discord en Settings.
