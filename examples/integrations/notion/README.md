# Notion

Addon metacore **portable v3** — tool-only (webhook) — para agregar registros a bases de datos de Notion desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_entry` | POST | `https://api.notion.com/v1/pages` | Agrega una nueva entrada a la base de datos. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `notion_api_key` | Integration Token | password | sí |
| `notion_database_id` | Database ID | string | no |

## Capabilities

- `http:fetch` → `*.notion.com` — crear/leer páginas en la API de Notion.

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce notion-1.0.0.tar.gz
```
