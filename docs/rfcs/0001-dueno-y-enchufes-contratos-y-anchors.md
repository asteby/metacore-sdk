# RFC 0001 (SDK): «dueño + enchufes», un solo primitivo para contratos y navegación

- Estado: **borrador para revisión del dueño** (solo documentación; sin código, sin cambio de schema en este PR).
- Fecha: 2026-11-24
- Tren: **R2-b** (extensión) del plan v2 (`ops/docs/plan-next-gen/PLAN-PITSLINE-PRO-ESCALABLE-2026-11-19-v2.md`, §5–§6). Es el «RFC de schema nº 2» de ese tren para la parte de navegación y **recorta** el RFC 0004 del kernel (asteby/metacore-kernel#653, borrador) a lo que falta.
- Alcance al implementarse: kernel `manifest/v3` (tipos, validador, `ResolveChain`, instalador), hub (publicación y firma), SDK (codegen `packages/sdk/src/generated/*`, `@asteby/metacore-ui` layout, `@asteby/metacore-runtime-react` `<AddonSlot>`), ops (resolvedor del sidebar), addons (`tools/manifestcheck`).
- Relacionados: ADR 0003 de este repo (reglas 1, 3, 5 y 6: este RFC es su aplicación a la navegación), ADR 0002 (páginas declaradas, `NavItem.page`), [`slot-priority.md`](../slot-priority.md), `addons/docs/ADDON-ROLES.md` (roles y R-A…R-D), `ops/docs/plan-next-gen/DECISIONES-PLAN-V2-2026-11-20.md` (N1–N7, O5).
- Evidencia: **[V]** verificado en este repo el 2026-11-24 · **[D]** dato de la auditoría de flota (83 addons), medido fuera de este repo y no re-medido aquí · **[P]** propuesto, no existe · **[S]** supuesto sin verificar.

## 0. Resumen

1. Todo dominio (pagos, correo, envíos, finanzas, ventas, productos, terceros) se modela igual: **un dueño** publica un enchufe con nombre y versión; **los enchufes** se conectan a él sin conocer a los demás.
2. El dueño publica dos clases de enchufe: **contratos** (comportamiento: `contracts[]` ↔ `implements[]`) y **anchors de navegación** (pantallas: `extension_points.nav_anchors[]` ↔ `items[].attach_to`).
3. La mitad de contratos **ya está en el schema** (kernel v0.321.0). Falta poco: `requires[].contract`, registro de contratos desde manifests y la proyección N-1.
4. La navegación pasa de «cada addon arma su grupo en `target`» a **8 secciones cerradas + anchors de dominio**. Un addon que aporta a Pedidos no crea otro menú: se cuelga de `sales.order` como pestaña, vista, acción, panel, filtro, modo o ajuste.
5. Regla compartida con R-D: **un `provider` no tiene menú propio**; aparece en el slot `contract.providers` que pinta el host para el dueño.

## 1. Motivación y datos

| # | Dato | Ev. | Lo que dice |
|---|---|---|---|
| 1 | **357 entradas de menú** en **83 addons** | [D] | El sidebar crece lineal con los addons; cada addon decide su grupo. |
| 2 | Las 4 plantillas de `create-addon` (`minimal`, `crud-model`, `embedded-page`, `full-page`) declaran `"target": "sidebar.operations"` | [V] | El valor por omisión manda todo a «Operaciones», sea o no operación. |
| 3 | `target` usado en este repo: `sidebar.{operations×11, finance×3, catalog×2, sales×2, sales_orders, customers, tickets}` | [V] | `target` es texto libre: `sales` y `sales_orders` conviven; `tickets` crea un grupo por addon. |
| 4 | Pagos: `contract.go` **~98 % idéntico** entre proveedores; **73 copias** de `host.go` | [D] | El contrato existe de hecho, pero copiado; nadie es dueño. |
| 5 | **0 usos** de `extension_points.slot_kinds` en la flota; 0 `slot_kinds`/`slots` en los manifests de este repo | [V]+[D] | El mecanismo de enchufe de UI existe pero nadie lo usa: se puede redefinir sin costo de migración. |
| 6 | `metadata.role`, `contracts[]`, `implements[]`, `extends_addon`, `replaces[]`, reglas R-A…R-D (`role_validate.go`) ya en `packages/sdk/src/generated/manifest-v3.ts` (kernel v0.321.0, `go.mod`) | [V] | La parte A del RFC 0004 ya entró; no hay que rediseñarla. |
| 7 | `NavGroup` hoy: `{title, icon, target, items, condition}`; sin `key`, `section` ni `order` | [V] | No hay identidad estable para colgarse de un grupo ni orden determinista. |
| 8 | `Requirement` hoy: `{key, version, optional, reason, enables}`; sin `contract` | [V] | Un consumidor solo puede depender de un addon concreto, lo que empuja a violar R-A. |

Causa común (ADR 0003 regla 1): **el addon decide dónde vive y de quién depende por nombre**, en vez de declarar *qué dominio extiende*.

## 2. El primitivo

```
DUEÑO (role contract | foundation | vertical | host)
  publica  contracts[]            ── comportamiento versionado
  publica  nav_anchors[]          ── pantallas con nombre de dominio
ENCHUFE (provider | extension | cualquier addon)
  implements[]   → contrato        (provider: solo esto, sin menú)
  attach_to      → anchor          (as: tab|view|action|panel|filter|mode|setting)
  requires[].contract → contrato   (consumidor: no nombra proveedores)
```

| Propiedad | Contrato | Anchor |
|---|---|---|
| Clave | `<familia>.<nombre>` (`payments.charge`) | `<sección>.<nombre>` (`sales.order`) |
| Quién lo publica | addon first-party con rol `contract` | addon first-party dueño del modelo, o el host (`home`, `insights.home`, `settings`) |
| Versión | semver del contrato | la del manifest del dueño; `accepts[]` es aditivo en minor |
| Si falta el dueño | instalación en cascada (§6) | `fallback` del enchufe (§5) |
| Desempate | selección por mercado (O5) | orden determinista (§5) |

## 3. Parte A: contratos (recorte del RFC 0004)

### 3.1 Ya existe [V] (no se toca)

`metadata.role` (8 roles), `contracts[]` (`key, version, operations[], events[], states, writable_models, provider_settings[], selection{cardinality, scopes}, health, conformance, deprecated`), `implements[]` (`contract, version, scope, countries, operations`), `extends_addon{key, version}`, `replaces[]`, `Deprecation`, reglas `role_*` (R-A…R-D duras solo con rol **declarado**; inferido = aviso).

### 3.2 Delta mínimo [P]

| Clave | Forma | Por qué |
|---|---|---|
| `compatibility.requires[].contract` | `{ "contract": "payments.charge", "version": "^1" }`, excluyente con `key` | El consumidor (`pos`) depende del contrato, no de `mercadopago` (R-A sin excepciones). |
| Registro de contratos alimentado por manifests | El kernel construye `ContractRegistry` con los `contracts[]` de los addons instalados y firmados; reemplaza la lista fija `capability.Contracts` en R-C | Un contrato nuevo no exige release del kernel. |
| Selección por mercado | `capability.Select(org, market, contract)`: binding de mercado > default de la org > único proveedor; `cardinality: one` sin binding y con >1 proveedor = error `ambiguous_provider` | Decisión O5; elimina la diferencia despacho/querier. |
| Conformidad | `contracts[].conformance` obligatorio para publicar un contrato `>=1.0.0`; un `implements` publica solo con CONF verde de su contrato | N1, plan §8.4. |
| Slot `contract.providers` | Reservado por el host (§4.5) | Une R-D con la navegación. |

Fuera de este RFC (sin cambios respecto al plan v2 §5.2): `phases`, `overridable`, `min_parent_schema`, `contract_event`, `read_models`, `subscriptions[].ordering` (va en el RFC de eventos), `capability_bindings` (tabla, no manifest).

### 3.3 Ejemplo: dueño, proveedor y consumidor

Dueño (`payments_core`; N3 lo oculta en el marketplace por política del hub sobre `role: contract`, sin campo nuevo: `visibility` solo admite `public|private` [V]):

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "payments_core", "name": "Pagos", "version": "1.0.0", "role": "contract" },
  "compatibility": { "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }] },
  "contracts": [{
    "key": "payments.charge",
    "version": "1.2.0",
    "operations": [
      { "key": "create", "kind": "action", "input": "schemas/create.in.json", "output": "schemas/create.out.json", "idempotent": true, "timeout_s": 20, "failover": "before_effect", "errors": ["declined", "invalid_card", "provider_down"] },
      { "key": "refund", "kind": "action", "idempotent": true, "failover": "never" },
      { "key": "status", "kind": "query", "failover": "allowed" }
    ],
    "events": [{ "name": "payment.settled", "version": 1, "payload_schema": "schemas/settled.json" }],
    "states": { "model": "Payment", "field": "status", "indeterminate": "pending_review" },
    "writable_models": ["Payment"],
    "provider_settings": [
      { "key": "mode", "type": "select", "options": ["sandbox", "live"], "default": "sandbox", "confirm_typed_on": "live" }
    ],
    "selection": { "cardinality": "one", "scopes": ["org", "branch", "country"] },
    "health": { "operation": "status", "every": "5m" },
    "conformance": "conformance/payments.charge"
  }],
  "extension_points": {
    "nav_anchors": [
      { "key": "finance.payments", "section": "finance", "title": "nav.finance.payments", "model": "Payment", "order": 20,
        "accepts": ["tab", "view", "action", "panel", "filter"], "permission": "payment.index" }
    ]
  }
}
```

Proveedor (`mercadopago`, conserva clave por D11; **sin `contributions.navigation`**):

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "mercadopago", "name": "Mercado Pago", "version": "3.0.0", "role": "provider" },
  "compatibility": { "requires": [
    { "key": "kernel", "version": ">=3.0.0 <4.0.0" },
    { "contract": "payments.charge", "version": "^1.2" }
  ]},
  "implements": [{ "contract": "payments.charge", "version": "^1.2", "countries": ["MX", "AR"], "scope": ["org", "branch"] }],
  "provides_capabilities": [
    { "key": "payments.charge.create", "handler": { "type": "wasm", "function": "charge_create" } },
    { "key": "payments.charge.refund", "handler": { "type": "wasm", "function": "charge_refund" } },
    { "key": "payments.charge.status", "handler": { "type": "wasm", "function": "charge_status" } }
  ]
}
```

Consumidor (`pos`): `"requires": [{ "contract": "payments.charge", "version": "^1", "optional": true, "enables": ["action:SalesOrder.charge"] }]`. Cobra por `handler.type: "capability"`; nunca nombra un proveedor.

## 4. Parte B: anchors de navegación

### 4.1 Secciones (lista cerrada)

`home`, `sales`, `customers`, `catalog`, `operations`, `finance`, `communication`, `insights` (sidebar, en ese orden) y `settings` (fuera del sidebar principal, en el menú de configuración). El host es dueño de las secciones; ningún manifest las crea, renombra ni reordena. El título visible sale de i18n por vertical (ADR 0003 regla 6: «Pacientes» en vez de «Clientes»), la clave no cambia.

### 4.2 Schema [P]

`extension_points.nav_anchors[]` (lo publica el dueño):

| Campo | Tipo | Regla |
|---|---|---|
| `key` | `<sección>.<nombre>` | Prefijo ∈ secciones; único en la instalación (salvo `provisional`, §10). |
| `section` | enum §4.1 | Debe coincidir con el prefijo de `key`. |
| `title`, `icon` | i18n key, lucide | Título del grupo/entrada que crea el anchor. |
| `model` \| `page` \| `url` | uno solo | Recurso principal del anchor (lista + detalle). |
| `order` | int | Orden del anchor dentro de la sección (asc). |
| `accepts[]` | subconjunto de `as` | Qué tipos de enchufe admite. Minor solo agrega. |
| `permission` | capability | Para ver el anchor. |
| `provisional` | bool | El dueño es temporal (§10). Default `false`. |

`contributions.navigation[]` (`NavGroup` amplía; `target` queda deprecado, §7):

| Campo | Nuevo | Regla |
|---|---|---|
| `key` | sí | `<addon_key>.<nombre>`; identidad estable del grupo (telemetría, dedupe, layouts guardados). |
| `section` | sí | enum §4.1; reemplaza `target`. |
| `order` | sí | Orden del grupo en la sección (asc). Default `1000`. |
| `items[].key` | sí | Único dentro del addon. |
| `items[].attach_to` | sí | Clave de anchor. Sin `attach_to` = entrada propia del grupo (como hoy). |
| `items[].as` | sí | `tab` \| `view` \| `action` \| `panel` \| `filter` \| `mode` \| `setting`. Requerido con `attach_to`. |
| `items[].fallback` | sí | `section` \| `hide`. Default por `as` (§5.3). |
| `items[].order` | sí | Orden dentro del anchor o del grupo (asc). Default `1000`. |

Semántica de `as` (todo `as` reutiliza campos existentes de `NavItem`; no hay renderer nuevo):

| `as` | Dónde aparece en el anchor | Campos que usa | Equivale hoy a |
|---|---|---|---|
| `tab` | pestaña del detalle del registro del anchor | `model`/`page` + relación al modelo del anchor | `DetailPanel` / página federada |
| `view` | vista alternativa de la lista | `view_type`, `view`, `group_by`, `columns` | segunda entrada de nav al mismo modelo |
| `action` | botón de cabecera o de fila | `actions[]` (claves de `contributions.actions`) | `actions[].placement` |
| `panel` | panel lateral del detalle | `page` o `SlotContribution` | `slots[]` |
| `filter` | sub-entrada filtrada | `filter`, `locked_scope`, `columns`, `actions` | entrada por estado |
| `mode` | modo de trabajo a pantalla completa sobre el recurso | `page` con `layout: immersive` | POS, kiosko |
| `setting` | sección en `settings.<anchor>` | `page` o `settings[]` del addon | `SettingsBlock` |

Relación con slots y UISeam: un anchor **es** un `slot_kind` (o un UISeam de ops [D]) con nombre de dominio, dueño y semántica fija; generaliza ambos en vez de sumar un tercer mecanismo. `as: panel` se materializa como `SlotContribution{slot_kind: "<anchor>.panel"}`; `<AddonSlot>` sigue siendo el único punto de montaje y conserva su regla de orden (`order` asc, luego `priority` desc). `slot_kinds` libres siguen válidos para casos sin dominio, y con 0 usos [D] no hay nada que migrar.

### 4.3 Ejemplo: dueño provisional y tres enchufes

Dueño provisional de Pedidos (`customers`, que hoy aloja `SalesOrder`):

```json
{
  "metadata": { "key": "customers", "name": "Clientes", "version": "5.0.0", "role": "foundation" },
  "extension_points": {
    "nav_anchors": [
      { "key": "sales.order", "section": "sales", "title": "nav.sales.orders", "icon": "ShoppingCart", "model": "SalesOrder", "order": 10,
        "accepts": ["tab", "view", "action", "panel", "filter", "mode"], "permission": "salesorder.index", "provisional": true },
      { "key": "customers.customer", "section": "customers", "title": "nav.customers.customers", "icon": "Users", "model": "Customer", "order": 10,
        "accepts": ["tab", "action", "panel", "filter"], "permission": "customer.index" }
    ]
  },
  "contributions": {
    "navigation": [{
      "key": "customers.sales", "section": "sales", "order": 10, "title": "nav.sales.orders",
      "items": [
        { "key": "pending_credit", "title": "nav.sales.pending_credit", "attach_to": "sales.order", "as": "filter",
          "filter": { "state": "credit_review" }, "locked_scope": true, "permission": "salesorder.authorize_credit",
          "actions": ["authorize_credit", "reject_credit"] }
      ]
    }]
  }
}
```

Enchufes de otros addons:

```json
{
  "metadata": { "key": "fiscal_mexico", "version": "4.0.0" },
  "contributions": {
    "navigation": [{
      "key": "fiscal_mexico.sales", "section": "sales", "title": "nav.fiscal",
      "items": [
        { "key": "invoices_tab", "title": "nav.fiscal.invoices", "attach_to": "sales.order", "as": "tab",
          "model": "Invoice", "permission": "invoice.index", "fallback": "hide", "order": 30 },
        { "key": "stamp", "title": "actions.stamp", "attach_to": "sales.order", "as": "action",
          "actions": ["stamp_invoice"], "permission": "invoice.stamp" }
      ]
    }]
  }
}
```

```json
{
  "metadata": { "key": "pos", "version": "2.0.0", "role": "app" },
  "contributions": {
    "navigation": [{
      "key": "pos.main", "section": "sales", "order": 5, "title": "nav.pos",
      "items": [
        { "key": "register", "title": "nav.pos.register", "attach_to": "sales.order", "as": "mode",
          "page": "register", "permission": "screen.pos.access", "fallback": "section" }
      ]
    }]
  }
}
```

Resultado en el sidebar: **una** entrada «Ventas › Pedidos» con sub-entrada «Crédito por autorizar», pestaña «Facturas» y acción «Timbrar» en el detalle, y el modo «Caja» lanzable desde Pedidos. Sin `fiscal_mexico` instalado, la pestaña no aparece (`hide`); sin `customers`, «Caja» queda como entrada propia en `sales` (`section`).

### 4.4 Regla del grupo

Un `NavGroup` cuyos items son **todos** `attach_to` no pinta grupo propio: solo existe como contenedor de declaración. Así un addon no agrega una entrada al sidebar por aportar a un dominio ajeno (objetivo del dato 1).

### 4.5 Slot `contract.providers` (R-D)

Para cada contrato instalado, el host crea `settings.<familia>` (p. ej. `settings.payments`) con un panel `contract.providers` que lista los `implements` instalados, su estado (`health`), sus `provider_settings` y el binding por mercado. Un `provider` **no declara** `contributions.navigation` (R-D ya es regla dura con rol declarado); un `extension` aporta UI solo con `slots[]` a `slot_kind: "contract.providers"` y `props.contract`. El host filtra por contrato.

## 5. Semántica de resolución (pura y determinista)

Entrada: manifests instalados y habilitados para la org (con versión), grants del usuario, mercado. Salida: árbol `sección → grupo/anchor → items`. Misma entrada ⇒ mismo árbol, byte a byte (prueba golden).

### 5.1 Orden

1. Secciones en el orden fijo de §4.1.
2. Dentro de la sección: anchors y grupos propios mezclados por `order` asc, luego `key` asc (desempate final, nunca el orden de carga).
3. Dentro de un anchor o grupo: items por `order` asc, luego `<addon_key>.<item.key>` asc.
4. Items del dueño del anchor con igual `order` van antes que los de terceros.

### 5.2 Dedupe por recurso resuelto

Dos items son el mismo recurso si coinciden en `(sección, attach_to|grupo, as, recurso)`, donde recurso = `page` o `model` + `view_type` + `filter` canónico (claves ordenadas) o `url` normalizada (sin barra final, query ordenada). Sobrevive uno, por este orden: dueño del anchor › first-party › menor `order` › menor `<addon_key>.<item.key>`. El perdedor no se pinta y el host emite `nav.dedupe{winner, loser}`. Las URLs que solo difieren en el orden de la query o en la barra final cuentan como el mismo recurso.

### 5.3 Fallback si el anchor no está

El anchor «no está» si su dueño no está instalado o habilitado, o si el usuario no tiene su `permission`.

| `as` | Default | `section` permitido | Con `section` |
|---|---|---|---|
| `tab`, `view`, `filter`, `mode` | `section` | sí | entrada propia en el grupo del addon, en la sección del prefijo del anchor |
| `action`, `panel`, `setting` | `hide` | **no** (lint) | n/a: no tienen sentido sin el recurso |

`as` no incluido en `accepts[]` del anchor = error de validación al instalar si el anchor está presente; aviso si no lo está.

### 5.4 Permisos y vacíos

RBAC **por hoja**: cada item exige su `permission` (o `requires[]`) **y** la del anchor; el grant del anchor no se hereda. Tras filtrar, un anchor o grupo sin items visibles y sin recurso propio visible no se pinta (ADR 0003 regla 5). `condition` del grupo o del item se evalúa antes del dedupe.

## 6. Instalación en cascada por contrato

1. `ResolveChain` (plan v2 §5.3) expande `requires[].contract` a su dueño con el `ContractRegistry` del hub (hub = catálogo publicado; kernel = instalados).
2. Instalar un `provider` instala su dueño (oculto en el catálogo, N3) y las dependencias de este. Toposort; ciclos y profundidad > 3 = error.
3. Instalar un consumidor con `requires[].contract` instala el **dueño**, no un proveedor. Con `cardinality: one` y ningún proveedor, la operación responde `no_provider` y la UI de `settings.<familia>` lo indica (degradar, no romper). Elegir el proveedor es una decisión de la org.
4. Desinstalar un dueño se bloquea mientras haya `implements` o consumidores no opcionales instalados (S3 de R1).
5. Un `requires[].contract` opcional ausente apaga sus `enables[]` (mecanismo ya existente).

## 7. Compatibilidad hacia atrás (N-1 durante 2 releases y mínimo 90 días, N5)

| Viejo | Nuevo | Proyección `from_v3` |
|---|---|---|
| `provides_capabilities[].key` con familia de un contrato registrado | `implements[]` | Al leer: se infiere `implements{contract, version: "*"}` con aviso `role_inferred`. |
| `implements[]` | `provides_capabilities[]` | Al servir a un host N-1: cada operación implementada sin entrada propia se proyecta a `{key: "<contrato>.<op>", handler: {type: "wasm", function: "<op>"}}`. Si el addon ya declara la clave, gana la suya. |
| `NavGroup.target` | `NavGroup.section` | `sidebar.<x>` → `<x>` si `<x>` es sección; `sidebar.sales_orders` → `sales`; cualquier otro → `operations` + aviso `nav_target_unknown`. Con ambos, deben coincidir. |
| item sin `attach_to` | igual | Sin cambio: entrada propia del grupo. |
| `requires[].key` a un proveedor | `requires[].contract` | Sin proyección: R-A ya lo marca; `manifestcheck` sugiere la forma nueva. |

El hub acepta publicar ambas formas durante la ventana. El corpus S5 (83 addons) corre el resolvedor viejo y el nuevo y compara (§11).

## 8. Seguridad y permisos

- **Solo first-party publica `contracts[]`** (N1) y anchors en las 8 secciones y `settings`. El hub rechaza ambos en manifests de terceros. Terceros: `implements` con CONF verde y revisión, y `attach_to`.
- `attach_to` **no concede datos**: el item solo ve lo que sus `requires[]` y `capabilities[]` piden; colgarse de `sales.order` no da `salesorder.*`.
- RBAC por hoja (§5.4). `locked_scope` conserva su semántica actual: filtro de seguridad en servidor.
- Gestionar proveedores exige `contract.<familia>.manage`; cambiar `mode` a `live` exige confirmación tipada (`confirm_typed_on`, ya en schema).
- Todo lo anterior va dentro del manifest firmado (§15 de la spec); el registro de contratos solo acepta contratos de addons con firma válida.

## 9. Anchors por dominio (catálogo inicial)

Dueño entre paréntesis cuando es provisional o [S]. Las claves son normativas; los dueños se pueden mover sin romper enchufes.

| Anchor | Sección | Dueño | Modelo | `accepts` | Enchufes típicos |
|---|---|---|---|---|---|
| `home` | home | host | página de inicio | `panel` | widgets de cualquier addon |
| `sales.order` | sales | (`customers`, provisional) | `SalesOrder` | tab, view, action, panel, filter, mode | `fiscal_mexico` (Facturas, Timbrar), `pos` (Caja), `receivables` (Cobranza), envíos (Guías) |
| `sales.quote` | sales | (`customers`) [S] | cotización | tab, action, filter | precios, CRM |
| `customers.customer` | customers | `customers` | `Customer` | tab, action, panel, filter | `receivables` (saldo), monedero, CRM |
| `catalog.product` | catalog | `products` | `Product` | tab, view, action, panel, filter | inventario (existencias), `catalog_fitment` (aplicaciones), precios |
| `operations.work_order` | operations | (`workshop`) [S] | `WorkOrder` | tab, view, action, panel, filter, mode | refacciones, citas |
| `operations.shipment` | operations | (contrato de envíos) [S] | envío | tab, action, filter | proveedores de envío vía `contract.providers` |
| `finance.payments` | finance | `payments_core` [P] | `Payment` | tab, view, action, panel, filter | conciliación |
| `finance.invoices` | finance | (`fiscal_mexico` → `fiscal_core` tras D12) | factura | tab, action, panel, filter | complementos (`l10n_mx`), REP |
| `finance.receivables` | finance | `receivables` [S] | cuenta por cobrar | tab, action, filter | cobranza, recordatorios |
| `finance.cash` | finance | (`caja`) [S] | corte de caja | tab, action, mode | CashDro |
| `communication.inbox` | communication | (contrato de mensajería) [S] | conversación | tab, panel, action, filter | WhatsApp, correo, IA |
| `communication.email` | communication | `connector_email` (`messaging.email@1`) | mensaje | tab, filter, setting | plantillas |
| `insights.home` | insights | host | tablero | `panel` | `contributions.dashboard[]` se proyecta aquí |
| `settings.<familia>` | settings | host, uno por contrato | n/a | `setting` + slot `contract.providers` | proveedores, extensiones |

## 10. Reconciliación: `sales.order` con `customers` como dueño provisional

- El anchor lleva nombre de **dominio**, no de addon: Pedidos vive en Ventas porque ahí lo busca el usuario, aunque hoy `SalesOrder` esté en `customers` (el addon «dios» con 41 grants `db:*` ajenos, plan v2 §7 R2-b).
- `customers` publica `sales.order` con `provisional: true`. Mientras sea el único, es el dueño.
- Cuando se extraiga el dueño definitivo (plan v2 M3, por demanda del segundo vertical), el nuevo addon first-party publica `sales.order` sin `provisional`. Regla: un anchor provisional y uno definitivo con la misma clave ⇒ gana el definitivo y el provisional se ignora con aviso; dos definitivos ⇒ error de instalación.
- Los enchufes (`attach_to: "sales.order"`) no cambian. Los layouts guardados y la telemetría usan la clave del anchor, no la del addon.
- Riesgo: que `provisional` se vuelva permanente. Mitigación: `manifestcheck` lista los anchors provisionales en el informe de cada release.

## 11. Plan de migración

| Fase | Contenido | Repos | Riesgo | Mitigación |
|---|---|---|---|---|
| F0 | Este RFC; lint en **aviso** en `manifestcheck` (§12); catálogo §9 como archivo lateral (`nav_anchors.yaml`, mismo patrón que `roles.yaml`) | sdk, addons | Bajo | Solo informa. |
| F1 | Schema R2-b: `nav_anchors`, `NavGroup.{key,section,order}`, items `{key,attach_to,as,fallback,order}`, `requires[].contract`, `ContractRegistry`, proyecciones §7; codegen SDK | kernel → sdk → hub | Medio (cadena de 4 repos, RS4) | Un solo tren; corpus S5 en CI de los 4 repos. |
| F2 | Resolvedor v2 en ops tras bandera `nav_resolver=v1|shadow|v2` por org; en `shadow` calcula ambos árboles y registra diferencias | ops, sdk (`@asteby/metacore-ui`) | Medio: entradas que «desaparecen» por dedupe | Diff en sombra 2 semanas sobre la flota; cero diferencias no explicadas antes de `v2`. |
| F3 | Dueños first-party publican anchors (`customers`, `products`, pagos, fiscal, correo); enchufes migran `target` → `section`/`attach_to`; proveedores quitan su navegación (R-D) | addons | Medio: layouts guardados y enlaces directos | Las URLs no cambian (el anchor reutiliza `/m/<model>`); alias de rutas donde cambie. |
| F4 | `manifestcheck` en **error** para lo migrado; `target` deprecado | addons, hub | Bajo | Ventana N5. |
| F5 | Fin de la ventana: el hub deja de aceptar `target` y la proyección `implements`→`provides_capabilities` se retira | kernel, hub | Bajo con telemetría D19 | Contadores de uso a 0 antes de retirar. |

Prerrequisitos de R1 que este RFC asume: S3 (resolución de dependencias entre pares) y P22a (ops delega en `capability.Select`).

## 12. Criterios de aceptación y lint de CI

Reglas nuevas de `tools/manifestcheck` (aviso en F0–F3, error en F4):

| ID | Regla |
|---|---|
| `NAV-01` | `section` ∈ lista cerrada; `nav_anchors[].key` con prefijo igual a `section`. |
| `NAV-02` | `attach_to` apunta a un anchor del catálogo (`nav_anchors.yaml` o manifests del corpus). |
| `NAV-03` | `as` ∈ `accepts[]` del anchor. |
| `NAV-04` | `fallback: section` solo con `as` ∈ {tab, view, filter, mode}. |
| `NAV-05` | `provider`/`extension` sin `contributions.navigation` (R-D, ya existe como regla de rol). |
| `NAV-06` | `target` y `section` coinciden si ambos están; `target` desconocido = aviso. |
| `NAV-07` | Anchors en secciones y `settings` solo en addons first-party; un único anchor definitivo por clave en el corpus. |
| `CON-01` | `requires[].contract` resoluble en el registro; `requires[].key` a un `provider` = R-A. |
| `CON-02` | `contracts[]` con `conformance` desde `1.0.0`; `implements` con versión que satisface al contrato publicado. |

Aceptación de R2-b (parte de este RFC):

1. El resolvedor es puro: la prueba golden sobre el corpus de 83 addons produce el mismo árbol en 10 corridas con orden de carga aleatorio.
2. 0 recursos duplicados y 0 grupos vacíos en el árbol del corpus.
3. 0 entradas de menú de addons con rol `provider`; todos los proveedores de pagos aparecen en `settings.payments`.
4. El número de entradas de primer nivel del sidebar no depende del número de addons que solo aportan enchufes (prueba: instalar `fiscal_mexico` no agrega entradas fuera de `finance`).
5. `pos` instala y cobra con `requires[].contract` sin nombrar un proveedor.
6. Un manifest N-1 (solo `target` y `provides_capabilities`) instala y se ve igual que hoy (diff en sombra vacío).

## 13. TODO en plantillas de `create-addon` (no se cambian en este PR)

- `packages/create-addon/templates/{minimal,crud-model,embedded-page,full-page}/manifest.json`: cambiar `"target": "sidebar.operations"` por `"section"` con `key` y `order` cuando el schema F1 esté publicado.
- Pedir la sección al hacer el scaffold (`--section`) en vez de asumir `operations`.
- Agregar `--role provider --contract <clave>` (plan v2 §8.3) que genere `implements`, `provides_capabilities` proyectables, `conformance/` y **ningún** `navigation`.
- Ejemplo de `attach_to` en `crud-model` (un `as: tab` sobre `customers.customer` con `fallback: hide`).
- `examples/order-generation` y `examples/fiscal-mx` usan `target`; migrarlos en F3.

## 14. Decisiones que requieren al dueño

| # | Decisión | Recomendación |
|---|---|---|
| A1 | Lista cerrada de 8 secciones + `settings` (§4.1) | Aprobar; abrir una sección nueva solo por RFC. |
| A2 | Pedidos en `sales.order` con `customers` como dueño provisional (§10) | Aprobar. |
| A3 | Terceros no publican anchors en R2-b (§8, `NAV-07`) | Aprobar; revisar con el primer tercero real. |
| A4 | Default de `fallback` por `as` (§5.3) | Aprobar. |
| A5 | Desempate del dedupe: dueño › first-party › `order` › clave (§5.2) | Aprobar. |
| A6 | Consumidor con `requires[].contract` instala el dueño, no un proveedor (§6.3) | Aprobar; la org elige proveedor. |

## 15. Preguntas abiertas

1. ¿La proyección `implements`→`provides_capabilities` por convención de nombre (`function = <op>`) basta, o hace falta `implements[].handlers{}` explícito? Propuesta: convención en N-1 y decidir con el corpus.
2. ¿`as: tab` necesita declarar la relación con el modelo del anchor (`via: "sales_order_id"`) o el host la deduce de `relations[]`? Propuesta: deducir; exigir `via` solo si hay más de una relación.
3. ¿Los layouts por rol guardados (M0.1) se indexan por clave de anchor desde F2 o se migran en F3?
4. ¿`insights.home` reemplaza la agrupación por addon de `contributions.dashboard[]` o convive una release?
5. ¿Un vertical (`fiscal_mexico`, `workshop`) puede publicar anchors en `operations`/`finance` como dueño definitivo, o solo `foundation`/`contract`? Propuesta: sí, si es dueño del modelo.
