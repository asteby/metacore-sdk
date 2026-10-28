# @asteby/metacore-runtime-react

React runtime for [Metacore](https://github.com/asteby/metacore-sdk) hosts. The metadata-driven CRUD layer that turns a manifest declaration into a working UI: dynamic tables, forms, action dispatchers, slot extension points, capability gates, and the federated addon loader.

This is a *runtime*, not a UI kit — visual primitives come from [`@asteby/metacore-ui`](../ui). Hosts inject their HTTP client and (optionally) tenant-branch context via React providers; no bundler aliases are required.

## Install

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-sdk @asteby/metacore-ui
```

Peers: `react`, `react-dom`, `react-i18next`, `i18next`, `@tanstack/react-router`, `@tanstack/react-table`, `date-fns`, `lucide-react`, `sonner`, `zustand`. They're declared as peers so React stays single-instance.

## Exports

| Export | What it does |
|---|---|
| `<DynamicTable model="…" />` | Metadata-driven CRUD table. Sortable, paginated, filterable, URL-syncable, with built-in dialogs. |
| `<DynamicForm fields={…} onSubmit={…} />` | Standalone form renderer over `ActionFieldDef[]`. |
| `<DynamicRecordDialog />` | Create / edit / view modal driven by `/metadata/modal/<model>`. |
| `<ActionModalDispatcher />` | Routes a custom action to its registered component, generic form, or confirm dialog. |
| `<AddonLoader />` | Injects a federated `remoteEntry.js` and calls the addon's `register(api)`. |
| `<Slot name="…" />` / `slotRegistry` | Named extension points contributed by addons. |
| `<CapabilityGate require="…" />` / `<CapabilityProvider />` | Conditional UI by capability. |
| `<NavigationBuilder />` / `useNavigation()` / `mergeNavigation()` | Merges host sidebar with addon `manifest.navigation`. |
| `<I18nProvider />` | Folds `manifest.i18n` namespaces into the host's i18next instance. |
| `<ApiProvider client={axios} />` / `useApi()` | Inject the host's HTTP client. Required by every dynamic component. |
| `<BranchProvider branch={…} />` / `useCurrentBranch()` | Optional tenant-branch context. |
| `useMetadataCache()` | Zustand store for table/modal metadata, persisted to LocalStorage. `prefetchAll(api)` warms it from `/metadata/all`. |
| `defaultGetDynamicColumns` / `makeDefaultGetDynamicColumns(helpers)` | The factory `<DynamicTable>` uses to convert metadata into TanStack column defs. The default reads from `col.key` (matching the kernel contract). |
| `DynamicIcon` | Lucide icon resolver by name. |
| `<LicenseGate state={…} onActivate={…}>` | El blindaje del negocio: envuelve la app; bloquea con un modal full-screen no descartable cuando la licencia de instancia falta/venció, degrada con banner en `grace`/`stale`. Branding-aware. |
| `<LicenseExpiryBanner state={…} />` / `<LicenseStatusBadge status={…} />` | Piezas sueltas del gate para Ajustes u otros lugares. |
| `isLicenseOperable` / `isLicenseBlocking` / `isPresetEntitled` / `isTrialExpired` | Helpers puros sobre `LicenseState`, espejo de `State.Operable()/Blocking()` del backend. |
| `<RealtimeProvider client={…} />` / `useRealtime()` / `useRealtimeInvalidate()` / `useRealtimeStatus()` / `useRealtimeTick()` | Reacción en vivo a `DATA_EVENT` del host (ver [Realtime](#realtime)). |

## Íconos

`<Icon name={value} />` (y `DynamicIcon`, que conserva su firma `{ name, className }`)
interpreta cualquier valor de ícono que un backend haya guardado. La clasificación
es `parseIconSpec(value)`, una función pura que devuelve
`{ kind: 'lucide', name } | { kind: 'emoji', value } | { kind: 'image', src } | { kind: 'unknown', raw }`.

| Formato | Ejemplos | Resultado |
|---|---|---|
| Lucide | `Brain`, `credit-card`, `credit_card`, `BrainIcon` | glifo Lucide |
| FontAwesome 5/6 | `fas fa-brain`, `fa-solid fa-brain`, `far fa-heart`, `fa fa-user-md`, `fa-brain` | glifo Lucide vía tabla `FONT_AWESOME_ALIASES` + prueba del nombre en Lucide |
| Otras fuentes | `mdi mdi-home`, `bi bi-house`, `ti ti-home`, `ri-home-line`, `mdi:home`, `material-icons home` | solo normalización contra Lucide (sin tabla) |
| Emoji | `🩺`, `👨‍⚕️`, `🇲🇽` | un solo grafema emoji (`Intl.Segmenter` si existe) |
| Imagen | `https://…`, `/ruta.png`, `./a.svg`, `uploads/a.png`, `data:image/(png\|jpeg\|webp\|gif\|svg+xml)` | `<img alt="" loading="lazy">`, se oculta si falla |
| Otro | `javascript:…`, `data:text/html`, SVG inline, texto libre | `unknown`: no se pinta texto crudo (null o la prop `fallback`) |

Lucide no incluye logos de marca (github, twitter…): las marcas (`fab fa-github`) quedan
`unknown` salvo que el host registre un resolutor.

**Orden de resolución:** (1) resolutores del host, el registrado más recientemente primero;
el primero que devuelve algo distinto de `null` gana; (2) el parser integrado.

```tsx
import { registerIconResolver } from '@asteby/metacore-runtime-react'

// Al arrancar el host. Devuelve un IconSpec (reusa los renderers del SDK),
// un ReactNode (se pinta tal cual) o null para ceder.
const dispose = registerIconResolver((spec) =>
  spec.startsWith('sprite:') ? <svg><use href={`/sprite.svg#${spec.slice(7)}`} /></svg> : null,
)
```

**Columnas:** `type: 'icon'` en la metadata de una columna pinta el valor con el resolutor
(tabla y detalle). Es opt-in: una columna de texto llamada `icon` no cambia. Un valor que
no se entiende muestra `-`.

`DynamicIcon` (menús, botones de acción) no pinta imágenes, solo glifos/emoji/nodos del host; para imágenes usa `<Icon>` o una columna `type: 'icon'`.

**Accesibilidad:** los íconos son decorativos (`aria-hidden`) salvo que se pase `label`.

## Realtime

El host expone un `RealtimeAPI` (`@asteby/metacore-sdk`) — en ops viaja como
`host.realtime` a las rutas inmersivas y como `api.realtime` a `register(api)`.
Los frames son org-scoped y **sin valores de fila** (identidad + qué llaves
cambiaron); la reacción típica es "refetch lo que muestro".

```tsx
// Host: montar una vez, dentro del QueryClientProvider y del provider de WS.
<RealtimeProvider client={realtimeClient}>…</RealtimeProvider>

// Addon federado: pasar el cliente explícito — el contexto React NO cruza la
// frontera de module federation, el objeto plano sí.
useRealtime({ models: ['SalesOrder'], client: host.realtime }, (e) => {
  if (e.action === 'resync' || e.id === currentId) refetch()
})

// Invalidar react-query (usa SIEMPRE el QueryClient del host — nunca crees otro):
useRealtimeInvalidate({ models: ['SalesOrder', 'sales_order_items'], client: host.realtime })

// Tablas y kanbans: opt-in por prop (apagado por default).
<DynamicTable model="SalesOrder" realtime />
<DynamicKanban model="WorkOrder" realtime />
// …o global para todo lo que cuelgue del provider:
<RealtimeProvider client={realtimeClient} defaultRealtime>
```

`useRealtimeInvalidate` invalida toda query cuya key (string, array anidado u
objeto) mencione el modelo, la tabla o `addon.Model` — también como segmento de
una ruta (`/data/sales_orders?…`). Se puede reemplazar el matcher con `match`.
Todos los hooks son no-op cuando no hay cliente (host sin realtime).

## Blindaje de licencia (`LicenseGate`)

El gate de licencia es un **primitivo del SDK**: ops y todos los verticales lo montan
en una línea. Reparto de responsabilidades:

- **kernel** → *enforcement* (qué está permitido; firma/verifica el estado).
- **SDK** (este módulo) → *UX* (gate, banner, badge).
- **hub** → *emisión* (mintea el token Ed25519).
- **hosts** → *wiring* (resuelven el `LicenseState` con su propio transporte y montan el gate).

Es **independiente del kernel**: no importa su cliente ni fija su versión. El host
resuelve el estado (p. ej. `GET /admin/license`) y pasa una promesa `onActivate`.

```tsx
import { LicenseGate } from '@asteby/metacore-runtime-react'
import { useLicenseState, useActivateLicense } from './features/license'

export function Shell({ children }) {
  const { data: state } = useLicenseState()          // GET /admin/license
  const activate = useActivateLicense()              // POST /admin/license/activate

  return (
    <LicenseGate
      state={state}
      onActivate={(code) => activate.mutateAsync(code)}
      branding={{ name: brand.name, logo: brand.logo }}
      onManage={() => navigate('/settings/license')}
    >
      {children}
    </LicenseGate>
  )
}
```

- Sin enforcement o estado operable (`valid`/`stale`/`grace`) → renderiza children.
  `stale`/`grace` montan además el banner degradado (`expired` no es descartable, el resto sí con TTL en localStorage).
- Enforcement && `missing`/`invalid`/`expired` → modal **bloqueante** con el formulario de activación.
  `plan === 'trial'` + `expired` → copy *"Tu prueba gratuita terminó"*.
- Activación exitosa desbloquea **sin recargar**: el host refresca el `state` y el gate se desmonta.
- **Gateo por rol** con `canActivate` (default `true`): cuando es `false`, el modal bloqueante se muestra **sin formulario** de activación y en su lugar aparece `readOnlyMessage` (default: *"Contacta al administrador de la plataforma para activar la licencia."*). Así solo el Platform Root/superadmin activa; los demás usuarios ven el bloqueo con la indicación de a quién contactar.

## Configuración de la organización (`OrgRuntimeProvider`)

Envuelve la app autenticada una vez y todas las tablas, kanban, diálogos y
fichas leen la configuración de la org por contexto:

```tsx
<OrgRuntimeProvider
  timeZone={org.timezone}            // 'America/Mexico_City' — fechas en la zona de la org
  currency={org.currency_code}       // 'MXN' — moneda por defecto
  numberLocales={{ es: 'es-MX' }}    // números y dinero como en México: 11,461.50 (no 11.461,50)
  systemActor={{ name: 'Asistente', avatarUrl: '/brand/assistant.png' }} // quién aparece cuando "lo hizo el sistema"
>
  <App />
</OrgRuntimeProvider>
```

- `numberLocales` mapea idioma de la UI → locale de `Intl` (primero el idioma
  completo, luego la base). Aplica a celdas `number`/`currency`, totales del
  pie, kanban (tarjetas y totales por carril) y el diálogo de registro. Las
  fechas siguen el idioma (`es`/`en`). Hooks: `useNumberLocale(lang)`,
  `resolveNumberLocale(lang, map)`.
- `systemActor` reemplaza el «Sistema» genérico en celdas `creator` /
  `created_by.*`, `AuditInfo`, `ActivityTimeline`, `RecordHistory` y el diálogo
  de registro. Sin provider se conserva «Sistema». Hook: `useSystemActor()`;
  regla compartida: `isSystemActorColumn(renderAs, key, namePath)`.

## Setup y salud de addons (`SetupFlow`, `HealthCard`, `AddonConfigSurface`)

UI declarativa para `contributions.setup` / `contributions.health`. También se
importa suelta con `@asteby/metacore-runtime-react/setup` (solo esta porción).

```tsx
import { SetupFlow, HealthCard, RecordsTable, StepStatusBadge, AddonConfigSurface } from '@asteby/metacore-runtime-react'

<SetupFlow flow={flowDef} client={client} onComplete={...} renderCustom={...} />
```

- **`SetupFlowClient`** es el adaptador: `getState()`, `runStep(key, {values?, action?})`,
  `skipStep(key)`, y opcionales `saveStep(key, values)` (autoguardado visible) y
  `subscribe(cb)` (push). El estado vive en el servidor, así que el flujo es reanudable:
  abre en el primer paso pendiente y no bloqueado.
- Estados por paso: `pending | running | ok | warn | error | blocked`. `depends_on` bloquea
  hasta que la dependencia esté `ok`, `warn` u omitida; los pasos `optional` se pueden omitir
  y no frenan la finalización.
- Polling con backoff (2 s x1.6, tope 30 s) mientras algo corre; `retry_after_s` del paso manda
  (1 s a 5 min). Tras `maxPollAttempts` (40) deja de consultar y ofrece «Revisar ahora».
- `kind=form` reutiliza `groupFieldsBySection` + `FieldSection`/`WizardProgress` de
  `form-layout(-ui)` (secciones o sub-pasos), `visible_when` y campos `write_only` (nunca se leen
  de vuelta; vacío = conservar). `kind=records` usa `RecordsTable` (copiar con fallback,
  estado y diagnóstico por fila). `kind=custom` usa `renderCustom` o el slot federado
  `step.slot ?? setup.<flow.key>.<step.key>` (props: `step, state, run, refresh`).
- `fix` de un diagnóstico: `{action}` corre el paso con esa acción, `{step}` salta a otro
  paso, `{url}` solo http(s) o ruta relativa (`onNavigate` si el host enruta).
- Textos es/en incluidos (`useSetupT`); se pueden sobrescribir con claves i18next `setup.*`.

### Migrar `UnifiedAddonConfigDialog` (ops) a `AddonConfigSurface`

En `ops/frontend/src/features/installed-addons/index.tsx`:

1. Borrar `UnifiedAddonConfigDialog`, `ConnectorCredentialFieldControl`, `DynamicConnectorSelect`,
   `fetchLookupOptions` y `connector-form-model.ts` (ahora viven en el SDK; los helpers se
   exportan desde el subpath `@asteby/metacore-runtime-react/setup`: `shapeMismatch`,
   `missingRequired`, `parseSaveError`, `safeUrl`...; la raíz solo expone los componentes).
2. Importar y montar:

```tsx
import { AddonConfigSurface } from '@asteby/metacore-runtime-react'
import { ensureAddonBundle } from '@/features/metacore/use-addon-locales'

const role = useAuthStore((s) => s.auth.user?.role)
const { activeBranch } = useActiveBranch()

<AddonConfigSurface
  addon={addon}
  connector={connector}
  open={open}
  onOpenChange={setOpen}
  onSaved={refetch}
  canManageIssuer={['owner', 'admin', 'superadmin'].includes((role ?? '').trim().toLowerCase())}
  activeBranch={activeBranch ? { id: activeBranchId, name: activeBranch.name } : null}
  ensureAddonBundle={(key, i18n) => ensureAddonBundle(i18n as any, key)}
  displayName={addonDisplayName(addon)}
  expectedOptionKinds={{
    serie_invoice: 'factura',
    serie_credit_note: 'nota_credito',
    serie_payment_complement: 'pago',
  }}
/>
```

   Requiere `<ApiProvider>` (o pasar `client={api}`) y `QueryClientProvider`; `toast` de sonner
   es el notificador por defecto (`notify` lo reemplaza). Las claves `installed_addons.*` y
   `common.*` siguen siendo las de ops: sus traducciones tienen prioridad sobre el texto del SDK.
   **`expectedOptionKinds`** (credencial -> `tipo` esperado de las opciones del lookup) es
   inyectable y vacío por defecto: el SDK ya no trae lógica fiscal. Ops **debe pasarlo**
   (como arriba) para conservar el filtrado actual de series por tipo de documento.
3. Diferencia deliberada: un secreto nunca se rellena desde `GET /integrations/:p/values`,
   aunque el backend lo devolviera.

## Minimal usage

```tsx
import {
  ApiProvider,
  CapabilityProvider,
  DynamicTable,
} from '@asteby/metacore-runtime-react'
import { api } from './lib/api'

export function App() {
  return (
    <ApiProvider client={api}>
      <CapabilityProvider capabilities={session.capabilities}>
        <DynamicTable model="tickets" />
      </CapabilityProvider>
    </ApiProvider>
  )
}
```

For props, response shapes, customization patterns and the full surface, see [`docs/dynamic-ui.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/dynamic-ui.md).

## How it talks to the kernel

| Endpoint | Used by |
|---|---|
| `GET /metadata/table/<model>` | `<DynamicTable>` (cached). |
| `GET /metadata/modal/<model>` | `<DynamicRecordDialog>` (cached). |
| `GET /metadata/all` | `useMetadataCache().prefetchAll()`. |
| `GET /data/<model>` | `<DynamicTable>` list. |
| `GET /data/<model>/<id>` | `<DynamicRecordDialog>` view/edit. |
| `POST /data/<model>` | Create. |
| `PUT /data/<model>/<id>` | Update. |
| `DELETE /data/<model>/<id>` | Delete (single + bulk). |
| `POST /data/<model>/<id>/action/<key>` | `<ActionModalDispatcher>`. |
| `GET /options/<endpoint>` | Relation pickers + select prefetch. |

All endpoints can be overridden per-component via the `endpoint` prop.

## Build

```bash
pnpm --filter @asteby/metacore-runtime-react build
```

## License

Apache-2.0
