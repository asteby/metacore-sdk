# WordPress

Addon metacore **portable v3** — tool-only (webhook) — para publicar y buscar artículos en un sitio WordPress desde conversaciones.

## Tools

| id | Method | Endpoint | Descripción |
|---|---|---|---|
| `create_post` | POST | `{{wp_site_url}}/wp-json/wp/v2/posts` | Publica un artículo nuevo (draft o publish). |
| `list_posts` | GET | `{{wp_site_url}}/wp-json/wp/v2/posts?search={{query}}` | Busca artículos por término. |

## Settings

| Key | Label | Tipo | Secret |
|---|---|---|---|
| `wp_site_url` | URL del sitio | string | no |
| `wp_basic_auth` | Auth Token (Base64) | password | sí |

## Capabilities

Vacía por diseño — el host del sitio WordPress se define por-instalación (`wp_site_url` en settings). Una capability `http:fetch` con wildcard no aporta seguridad y el validador rechaza `*`, `*.*` o TLD-only. La autorización de egress debe resolverse por-instalación (allow-list runtime al registrar la URL).

## Install

```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
# produce wordpress-1.0.0.tar.gz
```
