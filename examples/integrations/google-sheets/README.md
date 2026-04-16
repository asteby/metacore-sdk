# Google Sheets

Addon metacore **portable v3** — tool-only (webhook) — para registrar filas en Google Sheets desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `append_row` | POST | `https://sheets.googleapis.com/v4/spreadsheets/{{gsheets_spreadsheet_id}}/values/{{gsheets_sheet_name}}!A1:append` | Agrega una fila al final de la pestaña. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `gsheets_token` | OAuth Access Token | password | sí |
| `gsheets_spreadsheet_id` | ID de la hoja | string | no |
| `gsheets_sheet_name` | Nombre de la pestaña | string | no |

## Capabilities

- `http:fetch` → `*.googleapis.com` — Google Sheets API (cubre `sheets.googleapis.com`).

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce google_sheets-1.0.0.tar.gz
```
