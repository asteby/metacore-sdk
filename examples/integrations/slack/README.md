# Slack

Envía notificaciones a canales de Slack cuando ocurren eventos importantes. Addon metacore **portable v3** — webhook-only (sin backend propio): el host reenvía las llamadas del LLM al Incoming Webhook configurado por el admin.

- `key`: `slack`
- `category`: `communication`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_message` | POST | `{{slack_webhook_url}}` | Envía un mensaje a un canal de Slack |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `slack_webhook_url` | Webhook URL | password | sí |

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `slack.com` | API oficial de Slack |
| `http:fetch` | `hooks.slack.com` | Incoming webhooks de Slack |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Tras instalar el bundle, el admin pega su Incoming Webhook URL en Settings; las herramientas LLM resuelven `{{slack_webhook_url}}` por tenant.
