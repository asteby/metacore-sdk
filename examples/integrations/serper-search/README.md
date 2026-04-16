# Búsqueda Google (Serper)

Busca en Google y obtiene resultados actualizados: noticias, precios, eventos. Plan gratuito: 2500 búsquedas/mes.

## Tools
- `google_search` — POST `https://google.serper.dev/search`
- `google_news` — POST `https://google.serper.dev/news`

## Settings
- `serper_api_key` (secret)

## Capabilities
- `http:fetch google.serper.dev`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
