# Google Calendar

Addon metacore **portable v3** — tool-only (webhook) — para crear y consultar eventos en Google Calendar desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_event` | POST | `https://www.googleapis.com/calendar/v3/calendars/{{gcal_calendar_id}}/events` | Agenda una cita en el calendario. |
| `list_events` | GET | `https://www.googleapis.com/calendar/v3/calendars/{{gcal_calendar_id}}/events?...` | Lista eventos en un rango de fechas. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `gcal_token` | OAuth Access Token | password | sí |
| `gcal_calendar_id` | Calendario | string | no |

## Capabilities

- `http:fetch` → `*.googleapis.com` — Google Calendar API (cubre `www.googleapis.com`).

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce google_calendar-1.0.0.tar.gz
```
