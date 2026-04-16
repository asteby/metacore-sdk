# Lector de Páginas Web (Jina)

Extrae el contenido legible de cualquier URL (artículos, docs, páginas de producto) y realiza búsquedas web. Sin API key requerida.

## Tools
- `read_url` — GET `https://r.jina.ai/{{url}}`
- `search_web` — GET `https://s.jina.ai/{{query}}`

## Settings
Ninguno.

## Capabilities
- `http:fetch r.jina.ai`
- `http:fetch s.jina.ai`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
