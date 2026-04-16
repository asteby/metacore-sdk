# OpenAI DALL·E

Genera imágenes con IA usando DALL·E 3 de OpenAI.

## Tools
- `generate_image` — POST `https://api.openai.com/v1/images/generations`

## Settings
- `openai_api_key` (secret)

## Capabilities
- `http:fetch api.openai.com`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
