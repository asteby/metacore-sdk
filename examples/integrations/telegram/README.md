# Telegram

Envía mensajes a grupos o chats de Telegram vía Bot API. Addon metacore **portable v3** — webhook-only: invoca `api.telegram.org` con el bot token del tenant.

- `key`: `telegram`
- `category`: `communication`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_message` | POST | `https://api.telegram.org/bot{{telegram_bot_token}}/sendMessage` | Envía un mensaje de texto a un chat de Telegram |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `telegram_bot_token` | Bot Token | password | sí |
| `telegram_chat_id` | Chat ID | string | no |

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `api.telegram.org` | Bot API de Telegram |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Obtén un bot token de `@BotFather` y pégalo en Settings junto al Chat ID destino.
