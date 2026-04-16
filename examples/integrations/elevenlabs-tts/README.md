# ElevenLabs — Texto a Voz

Voces ultra-realistas con IA de ElevenLabs. Soporta clonación de voz y múltiples idiomas.

## Tools
- `text_to_speech` — POST `https://api.elevenlabs.io/v1/text-to-speech/{{elevenlabs_voice_id}}`

## Settings
- `elevenlabs_api_key` (secret)
- `elevenlabs_voice_id`
- `elevenlabs_model`

## Capabilities
- `http:fetch api.elevenlabs.io`

## Install
```bash
/tmp/metacore_cli validate .
/tmp/metacore_cli build .
```

Runtime: `webhook` · Kernel: `>=2.0.0 <3.0.0` · Tenant isolation: `shared`
