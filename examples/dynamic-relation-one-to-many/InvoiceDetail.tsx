// Ejemplo de uso de <DynamicRelation kind="one_to_many"> en una app host.
// Mantenido brand-neutral; copiar/pegar y ajustar imports al stack del host.
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
                </header>

                <DynamicRelation
                    kind="one_to_many"
                    model="line_items"
                    foreignKey="invoice_id"
                    parentId={id}
                    strings={{
                        title: 'Renglones',
                        addLabel: 'Agregar renglón',
                        emptyState: 'Sin renglones todavía.',
                    }}
                />
            </section>
        </ApiProvider>
    )
}
