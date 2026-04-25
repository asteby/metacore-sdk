# @asteby/metacore-tools

Cliente TypeScript para el runtime de Tools del kernel metacore.

Define un contrato común para que un host (ops, link, cualquier app del
ecosistema) ejecute tools publicadas en el hub marketplace, con validación
client-side de params consistente con la que hace `kernel/tool.Validate` en Go.

## Instalación

```bash
pnpm add @asteby/metacore-tools @asteby/metacore-sdk
```

## Uso

```tsx
import { HTTPToolClient, ToolRegistry, validateParams } from '@asteby/metacore-tools'

const client = new HTTPToolClient({
  baseURL: '/api/metacore',
  headers: () => ({ Authorization: `Bearer ${getAccessToken()}` }),
})

// Hidratar el registry al arrancar la sesión
const tools = await client.list()
const registry = new ToolRegistry()
for (const t of tools) registry.register(t.addon_key, t)

// Validar + ejecutar
const tool = registry.byID('stripe-integration', 'capture-payment')
if (!tool) throw new Error('tool no instalada')

const { cleaned, errors } = validateParams(tool.input_schema ?? [], {
  charge_id: 'ch_123',
})
if (errors.length) throw new Error(errors.map(e => `${e.param}: ${e.reason}`).join('; '))

const result = await client.execute({
  addon_key: tool.addon_key,
  tool_id: tool.id,
  installation_id: currentInstallationID,
  parameters: cleaned,
})
```

## API

| Export | Descripción |
|---|---|
| `ToolClient` | Interfaz transport-agnostic (`execute`, `list`). |
| `HTTPToolClient` | Implementación fetch-based que asume rutas `POST /tools/execute` y `GET /tools`. |
| `ToolRegistry` | Cache client-side de tools instaladas (by addon + id). |
| `validateParams` | Mirror del `Validate()` del kernel Go — mismas reglas, mismos mensajes. |
| `ToolExecutionRequest`/`Response`, `ToolDef`, `ToolInputParam`, `ValidationError` | Tipos. |

## Relación con el kernel

Este paquete es el lado frontend del contrato que define [`kernel/tool`](https://github.com/asteby/metacore-kernel/tree/main/tool) en Go. El host backend (ops, link) expone las rutas HTTP y delega al `tool.Registry` + `tool.HTTPDispatcher` interno, que firma con HMAC y llama al endpoint del addon.
