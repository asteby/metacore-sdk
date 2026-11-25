# @asteby/metacore-integrations

Integrations panel (RFC 0003 §4): **Salidas / Entradas / Registro**. It is
headless over an abstract API (`IntegrationsApi`) that the host implements;
the package never does HTTP.

```tsx
import { IntegrationsPanel } from '@asteby/metacore-integrations'

<IntegrationsPanel api={opsIntegrationsApi} locale="es" />
```

- **Salidas**: event checklist grouped by addon with search, destination URL,
  signing profile, write-only credential, filter, visual field mapping (source
  fields come from the event `payload_schema`) with a live preview body, and
  "send test".
- **Entradas**: contract picker, generated URL, **credential shown once**
  (`CredentialOnce`), and an ordered chain of action blocks
  (`record.upsert`, `event.emit`, `notify`, `command.run`). JSON is only an
  opt-in "advanced view", validated against the same closed set.
- **Registro**: deliveries and receipts with direction/status filters, replay
  of failed rows and queue status.

Accessibility: WAI-ARIA tabs (roving tabindex, arrows/Home/End), labelled
fields, `role="alert"` for errors, `aria-live` for status. i18n: `es` (default)
and `en`; pass `messages` to override any key.

The catalog comes from the kernel (`v3.Catalog`, manifest `events.emits[]`).
`IntegrationsApi.listEvents()` must return rows of that shape.

## Playground

`createMemoryIntegrationsApi()` is an in-memory implementation with example
events: use it for demos and tests (see `src/integrations.test.tsx`).

```tsx
import { IntegrationsPanel, createMemoryIntegrationsApi } from '@asteby/metacore-integrations'
export const Demo = () => <IntegrationsPanel api={createMemoryIntegrationsApi()} locale="en" />
```

Building blocks are exported too: `EventPicker`, `MappingEditor`,
`ActionChain`, `CredentialOnce`, and the pure helpers (`flattenSchemaFields`,
`previewBody`, `parseActions`, ...).

## Contrato de destinos y acciones de ingesta (v0.3)

Espejo del kernel (`inbound/targets.go`, `inbound/actions.go`) y de OPS
(`eventsint.Block`). Nombres en snake_case, tal cual viajan.

- `IntegrationsApi.listTargets?(): Promise<IngestTarget[]>` sirve el catalogo de
  destinos (`GET /api/integrations/targets` de OPS). Opcional; `listModels?` queda
  `@deprecated`. `parseIngestTargets(json)` valida la respuesta. Campos de v0.272
  (`actions_available`, `stage`, `restorable`, `ingest_cursor`) son opcionales.
- `ActionBlock` (`do`): `record.create` (`idempotency_field` obligatorio, `defaults`),
  `record.update`, `record.upsert`, `record.delete` (`mode?: 'soft'`, `max_rows`),
  `record.action` (`action`, `params`, `on_ineligible?: 'noop'|'fail'`, `max_rows`),
  `record.transition` (`to`), `record.restore`, mas `event.emit`, `notify`, `command.run`.
  `guard {field, path, op: 'gte'|'gt'}` solo en `create|update|upsert|delete`.
  `when` (`Condition`: `path` + exactamente uno de `eq|ne|in|exists`) en cualquier bloque.
- `mode: 'hard'` NO existe: OPS lo prohibe (`hard_delete_disabled`) y `parseActions` lo rechaza.
- `exists` es del kernel; el `BlockWhen` de OPS hoy acepta `eq|ne|in`.
- `parseActions` valida y normaliza (round-trip exacto, sin campos inventados);
  `incompleteActions` marca los bloques vacios; `needsAdvanced(block)` indica que el
  editor visual no puede mostrar el bloque entero (tipos nuevos, `guard`, `defaults`,
  `when` distinto de un `eq` en `notify`): el panel lo muestra de solo lectura y se
  edita en la vista avanzada. `VISUAL_ACTION_KINDS` son los que ofrece el selector.
- Helpers puros: `targetColumnsToMappingRows(target, {requiredOnly?})`, `inferSchema(sample)`.
- `createMemoryIntegrationsApi()` sirve `EXAMPLE_TARGETS` (la fixture del kernel,
  `test/fixtures/targets.json`).

## Entradas: elegir destino y mapear (TargetPicker)

Cuando el host implementa `listTargets()`, los bloques `record.*` del editor visual
dejan de pedir el modelo como texto y ofrecen: **addon -> modelo -> como identificar
el registro (`match`) -> columnas escribibles -> vista previa del registro**. Solo se
ofrece lo que el servidor declara. Sin `listTargets` (o si falla) se conserva el
comportamiento anterior (`listModels` / texto libre).

- `<TargetPicker targets value onChange kind t />`: listbox buscable agrupada por addon,
  teclado completo (flechas, Inicio/Fin, Enter, Esc; `aria-activedescendant`). Un destino
  sin el permiso que exige `kind` (`create`, `update`, `delete` de `permissions`; `upsert`
  pide create+update) o que no lista esa accion en `actions` aparece **deshabilitado con el
  motivo**, nunca oculto. Badges: nº de columnas, borrado suave, alcance sucursal/entidad.
- `<MappingEditor direction="in" target rows onChange contractSchema t />`: una fila por columna
  escribible (nombre, etiqueta, tipo, obligatoria, unica, `ref`, `options`), origen `Campo del evento`
  o `Texto fijo` (sin `{{input.x}}` todavia). La autosugerencia por nombre normalizado
  (`suggestSource`) solo se muestra, nunca se aplica sola. Las obligatorias sin origen se
  avisan y **bloquean el guardado** (`inboundProblems`, tambien: modelo no declarado, `match`
  que no es candidato, columna no permitida, sin permiso). Evento de ejemplo: pegar JSON o el
  generado desde el esquema del contrato; avisos locales de requerida/tipo/opcion (`validateRecord`).
- `match` se elige solo entre `target.match_candidates`. Al cambiar de modelo se limpian `match`
  y `mapping`.
- `when`: el editor visual no expone `exists`. El kernel lo define, pero el `BlockWhen` de OPS
  hoy acepta solo `eq|ne|in` y rechaza lo demas (`EDITABLE_WHEN_OPERATORS`).
- Pendiente (S-4): asistente por pasos y presets (upsert, borrado logico, estado, ...).

## Editores de politica: guarda, valores fijos, acciones de estado y condiciones

Con `listTargets`, **todos** los bloques `record.*` se editan visualmente (ya no solo JSON);
`needsAdvanced(block, { targets: true })` solo manda a la vista avanzada lo que ningun control
representa: `when` con `exists`, `mode` distinto de `soft`, `defaults` no escalares o `params` no
string. Sin `listTargets` (hosts viejos) todo sigue como antes (4 tipos clasicos, guarda/defaults en JSON).
Cada bloque trae ademas una vista JSON de solo lectura y la vista avanzada global sigue siendo el respaldo.
Un campo que el editor no conoce (p. ej. `scope`) se conserva intacto al editar.

- `<ActionPolicyForm action target onChange fields t />` segun el tipo de bloque y el destino:
  - `create|update|upsert`: **guarda** (`{field,path,op}`: columna sugerida desde `ingest_cursor` /
    `guard_candidates` o columnas fecha/numero; `path` = campo del evento de ejemplo, `payload.*`;
    `gte` recomendado: «solo aplica si el evento es igual o mas nuevo»), **valores fijos** (`defaults`, tipados
    por columna; no mapeadas) y, en `create`, `idempotency_field` (columna de texto escribible sin mapear).
  - `delete`: borrado **siempre logico** (sin `hard`), `max_rows` 1..100 y guarda.
  - `action`: solo las `actions_available` del destino, formulario de `params` (tipo, requerido, opciones,
    campo del evento o texto fijo) y `on_ineligible` (`noop`: ya estaba en ese estado; `fail`: error 409).
  - `transition`: `to` entre los estados de `stage.transitions` (los no declarados, deshabilitados).
  - `restore`: `max_rows`.
- `<WhenEditor value onChange fields t />`: operador `eq|ne|in` (nunca `exists`), ruta del evento y valor(es);
  `in` = lista de 1 a 50 escalares; vista previa en lenguaje claro («Se ejecuta cuando payload.action sea
  created o updated»). Los escalares conservan su tipo (numero/booleano) salvo que el campo sea string.
- Validacion que **bloquea el guardado** (`inboundProblems` ahora tambien cubre la politica, y `whenProblems`
  la condicion, con o sin catalogo): guarda sin columna/campo o con columna no permitida, `in` vacio o de mas de
  50, `to` no declarado, accion no disponible, parametro obligatorio sin valor, `max_rows` fuera de 1..100,
  default con tipo invalido o tambien mapeado, `idempotency_field` invalido, y que el `mapping` de los bloques que
  eligen filas solo lleve las columnas de `match` (todas mapeadas). Helpers puros en `policy-utils`:
  `guardColumns`, `policyProblems`, `whenProblems`, `transitionTargets`, `resetPolicy`.
- Al cambiar de modelo se limpian `match`, `mapping`, `guard`, `defaults`, `idempotency_field`, `action`,
  `params` y `to`.

## `ApiKeysManager` (claves de API y tokens de integracion)

`<ApiKeysManager api scopes t />`: lista con prefijo, emitir con ambito (y, si el host lo pide, vencimiento,
limite por minuto y campos propios como el dispositivo), **rotar con solapamiento visible** (la clave vieja
muestra «sigue valida hasta ...»), revocar con confirmacion y mostrar el secreto **una sola vez** con
`CredentialOnce`. Es headless: el host implementa `ApiKeysApi` (`list`, `create`, `rotate?`, `revoke`,
`remove?`) sobre sus endpoints; ninguna URL vive aqui. `rotate` recibe `{ graceSeconds }` (0 = cortar ya).

### Migrar `wt-ops-ai/frontend/src/pages/devices/device-api-tokens.tsx`

La pagina de dispositivos de OPS (`GenerateTokenDialog`, `TokenList`) es el segundo consumidor del primitivo.
Equivalencias (el archivo de OPS no se toca desde este repo; la migracion va en la rama de OPS):

| OPS hoy | `ApiKeysManager` |
|---|---|
| `POST /device-tokens` con `{name, device_id, scopes: 'a,b', rate_limit_per_minute, expires_in: '90d'}` | `api.create(draft)`: `draft.fields.device_id`, `draft.scopes` (array), `draft.rate_limit_per_minute`, `draft.expires_in_days` (el adaptador de OPS lo convierte a `'90d'` y une los scopes con coma) |
| respuesta `data.data.token` (se muestra con copiar/ojo) | `IssuedApiKey.secret` (se muestra una vez con `CredentialOnce`) |
| `GET /device-tokens` (`token_prefix`, `scopes` en CSV, `status`, `expires_at`, `last_used_at`, `device`) | `api.list()` mapeando a `ApiKey` (`prefix`, `scopes.split(',')`, `detail` = nombre del dispositivo) |
| `POST /device-tokens/:id/revoke` | `api.revoke(id)` |
| `DELETE /device-tokens/:id` | `api.remove(id)` |
| no existe rotacion | `api.rotate` se omite hasta que el backend de OPS la ofrezca (`apitoken.Rotate(id, grace)` del kernel) |
| `GET /device-tokens/stats`, `APIDocsSnippet` | se quedan en la pagina de OPS, alrededor del componente (`onChanged` refresca las estadisticas) |

Campos: `fields=[{name:'device_id', label, options: dispositivos}]`, `expiryOptions=[30,90,365]`,
`defaultRateLimit=60`, `defaultScopes=['messages:send','messages:read','conversations:read']`.
