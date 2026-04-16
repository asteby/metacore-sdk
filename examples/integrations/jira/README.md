# Jira

Addon metacore **portable v3** — tool-only (webhook) — para crear issues en Jira Cloud desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_issue` | POST | `https://{{jira_domain}}.atlassian.net/rest/api/3/issue` | Crea un issue/tarea en un proyecto. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `jira_domain` | Dominio (subdomain de atlassian.net) | string | no |
| `jira_basic_auth` | Auth Token (Base64) | password | sí |
| `jira_project_key` | Clave del Proyecto | string | no |

## Capabilities

- `http:fetch` → `*.atlassian.net` — crear issues en Jira Cloud (subdominio es por-tenant).

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce jira-1.0.0.tar.gz
```
