# `<DynamicRelation kind="one_to_many">` — ejemplo

Snippet auto-contenido que muestra cómo embeber una lista inline editable que cuelga del registro padre. Sigue la API mínima entregada en `runtime-react@8.x`:

```tsx
<DynamicRelation
    kind="one_to_many"
    model="line_items"
    foreignKey="invoice_id"
    parentId={id}
/>
```

## Backend asumido

- `GET /metadata/table/line_items` devuelve un `TableMetadata` con `columns` (envelope kernel `{success, data}`).
- `GET /data/line_items?f_invoice_id=eq:<parentId>` devuelve `{success, data, meta}` con la lista filtrada.
- `POST /data/line_items` crea con body `{ ...form, invoice_id: <parentId> }`.
- `PUT /data/line_items/<id>` y `DELETE /data/line_items/<id>` para edición/baja.

## App host (Vite + React + Tanstack Router)

`InvoiceDetail.tsx`:

```tsx
import { useParams } from '@tanstack/react-router'
import { ApiProvider, DynamicRelation } from '@asteby/metacore-runtime-react'
import { axiosInstance } from './lib/api'

export function InvoiceDetail() {
    const { id } = useParams({ from: '/invoices/$id' })
    return (
        <ApiProvider client={axiosInstance}>
            <section className="p-6 space-y-6">
                <header>
                    <h1 className="text-xl font-semibold">Factura #{id}</h1>
                    <p className="text-sm text-muted-foreground">
                        Editá los renglones directamente desde acá. El campo `invoice_id`
                        ya queda fijo al padre — no aparece en el form.
                    </p>
                </header>

                <DynamicRelation
                    kind="one_to_many"
                    model="line_items"
                    foreignKey="invoice_id"
                    parentId={id}
                    strings={{
                        title: 'Renglones',
                        addLabel: 'Agregar renglón',
                        emptyState: 'Sin renglones todavía. Agregá uno para empezar.',
                    }}
                />
            </section>
        </ApiProvider>
    )
}
```

## Comportamiento

- **Lista**: render inline con las columnas del metadata (excepto la FK, ocultada automáticamente).
- **Agregar**: abre un `<DynamicForm>` con los fields derivados del metadata (sin `invoice_id`); en submit envía `POST /data/line_items` con el FK inyectado.
- **Editar**: abre el mismo form pre-poblado; submit hace `PUT /data/line_items/<id>`.
- **Quitar**: confirma y hace `DELETE /data/line_items/<id>`.
- Todos los strings son props con default razonable (`addLabel`, `emptyState`, etc.) — brand-neutral.

## Override de permisos

```tsx
<DynamicRelation
    kind="one_to_many"
    model="line_items"
    foreignKey="invoice_id"
    parentId={id}
    canCreate={!invoice.locked}
    canDelete={!invoice.locked}
    canEdit={!invoice.locked}
/>
```

Una factura cerrada se renderiza read-only sin tocar el endpoint.

## Roadmap

`kind="many_to_many"` queda como follow-up — la RFC completa está en
`packages/runtime-react/docs/relations.md`.
