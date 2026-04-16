# Clima Actual

Consulta el clima actual de cualquier ciudad del mundo vía wttr.in. Sin API key requerida.

## Tools
- `current_weather` — GET `https://wttr.in/{{city}}?format=3`

## Settings
Ninguno.

## Capabilities
- `http:fetch wttr.in`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
