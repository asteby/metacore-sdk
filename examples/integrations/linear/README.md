# Linear

Addon metacore **portable v3** — tool-only (webhook) — para crear issues en Linear vía GraphQL desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_issue` | POST | `https://api.linear.app/graphql` | Crea un issue en Linear (GraphQL mutation). |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `linear_api_key` | API Key | password | sí |
| `linear_team_id` | Team ID | string | no |

## Capabilities

- `http:fetch` → `api.linear.app` — mutations GraphQL contra Linear.

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce linear-1.0.0.tar.gz
```
