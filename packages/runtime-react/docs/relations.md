# `<DynamicRelation>` — propuesta de API

> **Status:** Draft / RFC. La implementación todavía no está mergeada.
> **Audience:** autores de hosts (apps Vite que consumen `@asteby/metacore-runtime-react`) y mantenedores del kernel/SDK.
> **Companion contracts:** `manifest.RelationDef` (`metacore-kernel/manifest/manifest.go`), envelope kernel `{success, data, meta}`.

## 1. Motivación

El kernel ya expone `RelationDef` en el manifest de cada `ModelDefinition` con dos formas:

- `kind: "one_to_many"` — el modelo dueño tiene muchas filas en `Through`. La FK vive en `Through.foreign_key` apuntando a `owner.references` (default `"id"`).
- `kind: "many_to_many"` — `Pivot` es la tabla de unión entre el dueño y `Through`. La FK del lado dueño vive en `Pivot.foreign_key`.

Hoy `runtime-react` cubre el plano flat (un modelo, una tabla) con `<DynamicTable>`, `<DynamicForm>` y `<DynamicCRUDPage>`. Falta un primitivo que renderice **edges** entre modelos sin que el host tenga que escribir el wiring de cada relación a mano.

`<DynamicRelation>` es ese primitivo: un componente metadata-driven que recibe el modelo dueño, el `id` del registro padre, y la `name` de la relación declarada en el manifest; el resto (endpoint, columnas, acciones) se resuelve desde la metadata expuesta por el kernel.

## 2. Principios de diseño

1. **Un solo componente, dos kinds.** Misma forma de invocación, distinto comportamiento. El `kind` es un discriminator, no dos componentes separados, así el hosts puede leer la metadata y decidir cuál usar sin un switch.
2. **Composición sobre configuración.** `<DynamicRelation>` usa `<DynamicTable>` y `<DynamicForm>` por dentro. No reimplementa toolbar, paginación ni columns rendering.
3. **Brand-neutral.** Cero copy de producto; todos los strings son props con default razonable. Las traducciones se resuelven vía `useTranslation()` cuando el host monta `<I18nProvider>`.
4. **Backend-shape declarativo.** El componente no asume rutas custom; sólo confía en el contrato de sub-resource definido en §6. Si el kernel cambia el shape, sólo se actualiza el adapter interno.
5. **Misma envelope que el resto del kernel.** `{success, data, meta}` para listas paginadas, `{success, data}` para mutaciones single-record. Errores: `{success: false, error: {...}}`.

## 3. API pública

### 3.1 Props comunes

```ts
export type DynamicRelationKind = 'one_to_many' | 'many_to_many'

interface DynamicRelationCommonProps {
    /** Modelo dueño tal como aparece en el manifest (`ModelDefinition.ModelKey`). */
    model: string

    /** id del registro padre. Suele venir del router (`useParams().id`). */
    parentId: string | number

    /**
     * Nombre de la relación tal como está declarada en
     * `RelationDef.name` para `model`. Es el address que usa la SDK; no
     * pasar el modelo target — el SDK lo deriva del manifest.
     */
    name: string

    /**
     * Override opcional del foreign key. Se usa sólo cuando el host
     * monta una variante no declarada en el manifest (ej: una vista
     * custom). En el caso normal queda undefined y el SDK lo lee de
     * `RelationDef.ForeignKey`.
     */
    foreignKey?: string

    /**
     * Override del modelo target. Default = `RelationDef.through`. Mismo
     * caveat que `foreignKey`.
     */
    through?: string

    /** Hidden columns en la tabla embebida. Pasthru a `<DynamicTable>`. */
    hiddenColumns?: string[]

    /** Toolbar / acciones visibles. Default deriva de `RelationDef.permissions`. */
    canCreate?: boolean
    canDelete?: boolean

    /** Mensajería. Strings traducibles. */
    strings?: Partial<DynamicRelationStrings>

    /** className opcional para el wrapper. */
    className?: string
}

export interface DynamicRelationStrings {
    title: string             // default: nombre de la relación
    emptyState: string        // default: "No hay registros relacionados"
    addLabel: string          // default: "Agregar"
    removeLabel: string       // default: "Quitar"
    confirmRemove: string     // default: "¿Quitar la relación?"
}
```

### 3.2 `kind="one_to_many"`

```ts
interface DynamicRelationOneToManyProps extends DynamicRelationCommonProps {
    kind: 'one_to_many'
    /**
     * Override del modelo hijo. Default = `RelationDef.through`.
     * El componente lista filas de `through` filtradas por
     * `foreignKey == parentId`.
     */
    model: string  // owner
    foreignKey?: string
}
```

**Comportamiento:**
- Lista: `GET /api/dynamic/<through>?f_<foreignKey>=eq:<parentId>` (filter sintaxis estándar de `query/params.go`).
- Crear: `POST /api/dynamic/<through>` con `{ <foreignKey>: parentId, ...form }`. El `<DynamicForm>` interno usa la metadata del modelo `through` y oculta el FK porque ya está fijado.
- Borrar (desvincular ≡ borrar la fila hija): `DELETE /api/dynamic/<through>/<childId>`.
- Editar: redirige al CRUD page del modelo hijo, no se inlinea (se evita renderear dos formularios full-screen).

### 3.3 `kind="many_to_many"`

```ts
interface DynamicRelationManyToManyProps extends DynamicRelationCommonProps {
    kind: 'many_to_many'
    /**
     * Override de la pivot table. Default = `RelationDef.pivot`. Sólo
     * se necesita si el host expone variantes custom; el caso normal
     * queda undefined.
     */
    through?: string  // target model
    pivot?: string

    /**
     * Campos extra de la pivot que el formulario de attach debe
     * pedir al usuario (ej: `role` en `user_org`, `quantity` en
     * `order_product`). Si está vacío, attach es un combobox simple
     * con sólo el target id.
     */
    pivotFields?: string[]
}
```

**Comportamiento:**
- Lista: `GET /api/dynamic/<model>/<parentId>/relations/<name>` — sub-resource virtual; la respuesta es la unión target ⨝ pivot, paginada con la misma envelope que `<DynamicTable>` consume hoy.
- Attach: `POST /api/dynamic/<model>/<parentId>/relations/<name>` con `{ target_id: "...", ...pivotFields }`. Si `pivotFields` está vacío, el componente usa un combobox poblado por el endpoint `/api/options/<through>` ya existente; con `pivotFields` no vacío, abre un `<DynamicForm>` inline.
- Detach: `DELETE /api/dynamic/<model>/<parentId>/relations/<name>/<targetIdOrPivotId>`.
- Editar pivot: si el manifest declara `pivot.editable=true`, click en una fila abre el `<DynamicForm>` con los `pivotFields`; PUT al mismo path del detach.

> **Nota para el kernel:** los endpoints `/api/dynamic/:model/:id/relations/:name(/...)` no existen todavía. Son la otra mitad de este RFC y dependen del trabajo descrito en §6.

### 3.4 Tipo unión exportado

```ts
export type DynamicRelationProps =
    | DynamicRelationOneToManyProps
    | DynamicRelationManyToManyProps

export function DynamicRelation(props: DynamicRelationProps): JSX.Element
```

El discriminator es `kind`. TypeScript narrowea automáticamente, así que `props.pivot` sólo es accesible cuando `kind === "many_to_many"`.

## 4. Resolución de metadata

La metadata se lee del cache compartido (`useMetadataCache` en `metadata-cache.ts`). El SDK necesita:

1. **`TableMetadata`** del modelo `through` — para columns de la tabla embebida.
2. **`RelationDef`** del modelo dueño — para validar `name`, derivar `foreignKey`, `through`, `pivot`.

Se propone extender `TableMetadata` con un campo `relations?: RelationDef[]` (mismo shape que el manifest, expuesto vía `GET /api/dynamic/:model/metadata`). El SDK no fabrica defaults: si el `name` solicitado no existe en `metadata.relations`, el componente renderiza un panel de error con el mensaje `Unknown relation "<name>" on model "<model>"` en dev y un fallback vacío en producción (mismo patrón que `<DynamicTable>` cuando recibe un model inexistente).

```ts
// types.ts — addition
export interface RelationMetadata {
    name: string
    kind: DynamicRelationKind
    through: string
    foreignKey: string
    references?: string  // default "id"
    pivot?: string
    pivotFields?: ActionFieldDef[]  // m2m only — campos editables sobre el pivot
    permissions?: { canAttach: boolean; canDetach: boolean; canCreate: boolean; canDelete: boolean }
}

export interface TableMetadata {
    // ...existing
    relations?: RelationMetadata[]
}
```

## 5. Ejemplos de uso

### 5.1 One-to-many: comentarios de un ticket

Modelo `tickets` con `RelationDef{name: "comments", kind: "one_to_many", through: "ticket_comments", foreignKey: "ticket_id"}`.

```tsx
import { DynamicRelation } from '@asteby/metacore-runtime-react'

export function TicketDetailPage() {
    const { id } = useParams({ from: '/tickets/$id' })
    return (
        <div className="space-y-8">
            <TicketHeader id={id} />
            <DynamicRelation
                kind="one_to_many"
                model="tickets"
                parentId={id}
                name="comments"
            />
        </div>
    )
}
```

Sin más config, el componente:
- pide `GET /api/dynamic/ticket_comments?f_ticket_id=eq:<id>`
- renderiza la tabla con columns derivadas del `TableMetadata` de `ticket_comments`
- expone un botón "Agregar" que abre `<DynamicForm>` con `ticket_id` pre-llenado y oculto.

### 5.2 Many-to-many simple: tags de un artículo

Modelo `articles` con `RelationDef{name: "tags", kind: "many_to_many", through: "tags", pivot: "article_tags", foreignKey: "article_id"}`.

```tsx
<DynamicRelation
    kind="many_to_many"
    model="articles"
    parentId={article.id}
    name="tags"
/>
```

Como no hay `pivotFields`, el botón "Agregar" abre un combobox poblado por `/api/options/tags` y attach es un POST con `{ target_id }`.

### 5.3 Many-to-many con pivot rico: usuarios de una organización con `role`

Modelo `organizations` con `RelationDef{name: "members", kind: "many_to_many", through: "users", pivot: "org_members", foreignKey: "organization_id"}`.

El manifest declara `pivot.fields: [{ key: "role", label: "Rol", type: "select", options: [...] }, { key: "starts_at", type: "date" }]`.

```tsx
<DynamicRelation
    kind="many_to_many"
    model="organizations"
    parentId={org.id}
    name="members"
    strings={{ title: 'Miembros', addLabel: 'Invitar' }}
/>
```

El botón "Invitar" abre un `<DynamicForm>` con un combobox `target_id` (poblado por `/api/options/users`) más los `pivotFields`. Al guardar: `POST /api/dynamic/organizations/<orgId>/relations/members` con `{ target_id: "...", role: "owner", starts_at: "2026-05-04" }`.

### 5.4 Embebido en `<DynamicCRUDPage>`

El caso típico: un `tabs` panel debajo del form de edición.

```tsx
<DynamicCRUDPage
    model="tickets"
    detailExtras={(record) => (
        <Tabs defaultValue="comments">
            <TabsList>
                <TabsTrigger value="comments">Comentarios</TabsTrigger>
                <TabsTrigger value="watchers">Watchers</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
                <DynamicRelation kind="one_to_many" model="tickets" parentId={record.id} name="comments" />
            </TabsContent>
            <TabsContent value="watchers">
                <DynamicRelation kind="many_to_many" model="tickets" parentId={record.id} name="watchers" />
            </TabsContent>
        </Tabs>
    )}
/>
```

`detailExtras` ya existe (o se agrega con esta RFC) como punto de extensión del CRUD page.

## 6. Contrato backend requerido

Esta RFC asume tres endpoints adicionales en `dynamic/handler.go` (no existen todavía):

| Verb     | Path                                                             | Notes                                                                        |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`    | `/api/dynamic/:model/:id/relations/:name`                        | Lista paginada del lado N de la relación. Acepta los mismos query params que `/api/dynamic/:model`. Sólo m2m necesita esto en estricta lectura; o2m también lo expone para devolver la metadata del FK aplicada. |
| `POST`   | `/api/dynamic/:model/:id/relations/:name`                        | m2m: attach. Body: `{ target_id, ...pivotFields }`.                          |
| `DELETE` | `/api/dynamic/:model/:id/relations/:name/:targetIdOrPivotId`     | m2m: detach. o2m: redirige al delete del modelo hijo.                        |

El o2m **puede** funcionar sólo con los endpoints flat existentes (filtro `f_<fk>=eq:<id>`) — es la implementación inicial sugerida. Los sub-resource paths se reservan por consistencia y para que el SDK no tenga que ramificar el cliente HTTP por kind.

## 7. Open questions

1. **Cascade en o2m delete.** El `<DynamicRelation kind="one_to_many">` borra la fila hija; ¿debería ofrecer un modo "soft-detach" que limpia el FK a NULL en vez de borrar? Default propuesto: borrar (consistente con el comportamiento actual del `<DynamicTable>`). Soft-detach se puede agregar como `onRemove="null" | "delete"` en una iteración futura sin romper la API.
2. **Bulk attach.** No incluido en v1 — un solo target por click. La toolbar bulk de `<DynamicTable>` se reusará cuando el kernel exponga `POST /relations/:name/bulk`.
3. **Polimórficas.** Fuera de alcance. `RelationDef.Kind` no las contempla todavía; cuando lo haga, se agrega `kind: "polymorphic"` al union.
4. **Ordering del pivot.** Si el manifest declara `pivot.position` (columna entera), agregar drag&drop a la tabla. Marcado como follow-up; el componente expone `enableReorder?: boolean` placeholder con default `false`.

## 8. Plan de entrega

1. **Doc (esta RFC).** Acordar shape de props y endpoints requeridos. ← *este PR.*
2. **Kernel.** Extender `dynamic/handler.go` con los sub-resource paths (§6). Exponer `relations` en el payload de metadata.
3. **SDK runtime-react.** Implementar `dynamic-relation.tsx` reusando `<DynamicTable>` y `<DynamicForm>`. Re-exportar desde `index.ts`.
4. **Tests.** Snapshot del shape de props + test de integración contra un kernel mockeado (mismo patrón que `dynamic-table` ya usa).
5. **Adopción.** Una app del ecosistema (probablemente *link*) migra al menos una pantalla detail-with-children como dogfood antes del release.
