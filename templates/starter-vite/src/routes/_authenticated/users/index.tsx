import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DynamicTable,
  ApiProvider,
  type GetDynamicColumns,
} from '@asteby/metacore-runtime-react'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/users/')({
  component: UsersPage,
})

/**
 * TODO(host): replace with a design-system-aware renderer. This minimal
 * default turns every metadata column into a plain accessor. Host apps
 * typically add badges, avatars, relation lookups, etc.
 */
const getDynamicColumns: GetDynamicColumns = (metadata) =>
  metadata.columns.map(
    (col): ColumnDef<any> => ({
      accessorKey: col.key,
      header: col.label,
    })
  )

function UsersPage() {
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground">
          Demo of <code>DynamicTable</code> from <code>@asteby/metacore-runtime-react</code>. Point
          <code>endpoint</code> at your backend's dynamic-resource route.
        </p>
      </header>
      <ApiProvider client={api}>
        <DynamicTable
          model="users"
          endpoint="/admin/dynamic/users"
          getDynamicColumns={getDynamicColumns}
        />
      </ApiProvider>
    </div>
  )
}
