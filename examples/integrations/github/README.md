# GitHub

Addon metacore **portable v3** — tool-only (webhook) — para gestionar issues y comentarios en repositorios GitHub desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_issue` | POST | `https://api.github.com/repos/{{github_repo}}/issues` | Abre un nuevo issue. |
| `add_comment` | POST | `https://api.github.com/repos/{{github_repo}}/issues/{{issue_number}}/comments` | Comenta un issue existente. |
| `close_issue` | PATCH | `https://api.github.com/repos/{{github_repo}}/issues/{{issue_number}}` | Cierra un issue. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `github_token` | Personal Access Token | password | sí |
| `github_repo` | Repositorio (owner/repo) | string | no |

## Capabilities

- `http:fetch` → `api.github.com` — crear y modificar issues/comentarios.

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce github-1.0.0.tar.gz
```
