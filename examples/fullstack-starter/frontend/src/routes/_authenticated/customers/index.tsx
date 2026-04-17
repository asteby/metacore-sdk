import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DynamicTable, ApiProvider, type GetDynamicColumns } from '@asteby/metacore-runtime-react'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/customers/')({
  component: CustomersPage,
})

const getDynamicColumns: GetDynamicColumns = (metadata) =>
  metadata.columns.map(
    (col): ColumnDef<any> => ({
      accessorKey: col.key,
      header: col.label,
    })
  )

function CustomersPage() {
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">Manage your customer contacts via kernel-powered dynamic CRUD.</p>
      </header>
      <ApiProvider client={api}>
        <DynamicTable model="customers" endpoint="/admin/dynamic/customers" getDynamicColumns={getDynamicColumns} />
      </ApiProvider>
    </div>
  )
}
