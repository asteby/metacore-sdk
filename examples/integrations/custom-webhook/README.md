# Webhook Personalizado

Conecta cualquier servicio propio o de terceros vía un endpoint HTTP. El admin configura la URL destino (`webhook_url`) en tiempo de instalación.

## Tools
- `call_endpoint` — POST `{{webhook_url}}`

## Settings
- `webhook_url` — URL destino (definida por el admin al instalar)

## Capabilities
- `http:fetch *.example.com` — **placeholder**. El host sustituye este target por el dominio real derivado de `settings.webhook_url` en el momento de la instalación. Durante la revisión el admin debe aprobar el dominio específico; el kernel NO concede egress arbitrario.

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
