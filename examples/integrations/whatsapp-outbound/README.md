# WhatsApp — Envío Externo

El agente envía mensajes a otros números y gestiona contactos. Addon metacore **portable v3** — webhook-only: invoca Meta Graph (WhatsApp Cloud API).

- `key`: `whatsapp_outbound`
- `category`: `communication`
- `kernel`: `>=2.0.0 <3.0.0`
- `tenant_isolation`: `shared`
- `backend.runtime`: `webhook`

## Tools

| ID | Método | Endpoint | Descripción |
|---|---|---|---|
| `send_whatsapp` | POST | `https://graph.facebook.com/v20.0/me/messages` | Envía un mensaje de WhatsApp a un número |
| `list_contacts` | GET | `https://graph.facebook.com/v20.0/me/contacts` | Consulta contactos de la organización |

## Settings

Esta integración no declara settings propios; las credenciales de Meta Graph se resuelven desde el dispositivo activo del tenant en el host.

## Capabilities

| Kind | Target | Razón |
|---|---|---|
| `http:fetch` | `graph.facebook.com` | Meta WhatsApp Cloud API (Graph) |

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Requiere un WhatsApp Business Account conectado al tenant (dispositivo activo en la conversación).
