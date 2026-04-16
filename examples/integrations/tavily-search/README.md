# Búsqueda Web (Tavily)

Busca en Internet y obtiene resultados actualizados con IA. Ideal para responder preguntas que requieren información reciente o fuentes externas.

## Tools
- `web_search` — búsqueda web natural (POST `https://api.tavily.com/search`)

## Settings
- `tavily_api_key` (secret) — API key de Tavily

## Capabilities
- `http:fetch api.tavily.com`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
