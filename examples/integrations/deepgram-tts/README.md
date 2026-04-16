# Deepgram — Texto a Voz

Convierte texto en audio con voces naturales de Deepgram Aura.

## Tools
- `text_to_speech` — POST `https://api.deepgram.com/v1/speak?model={{deepgram_model}}`

## Settings
- `deepgram_api_key` (secret)
- `deepgram_model` (default `aura-asteria-en`)

## Capabilities
- `http:fetch api.deepgram.com`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
