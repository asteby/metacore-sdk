import { useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PermissionsManager } from '@asteby/metacore-runtime-react'
import { Button, Skeleton } from '@asteby/metacore-ui'
import { MY_PERMISSIONS_QUERY_KEY, type PermissionsApi } from './permissions-api'
import { usePermissionsCatalog, type UsePermissionsCatalogOptions } from './use-permissions-catalog'

export interface PermissionsPageLabels {
  title?: string
  loading?: string
  error?: string
  retry?: string
  empty?: string
}

export interface PermissionsPageProps
  extends Omit<UsePermissionsCatalogOptions, 'loadBackendCatalog'> {
  api: PermissionsApi
  labels?: PermissionsPageLabels
  /** Extra content rendered above the manager (e.g. a breadcrumb). */
  header?: ReactNode
  className?: string
}

const DEFAULT_LABELS: Required<PermissionsPageLabels> = {
  title: 'Permissions',
  loading: 'Loading permissions',
  error: 'Could not load the permission catalog.',
  retry: 'Retry',
  empty: 'No modules available to assign.',
}

/**
 * Role x module x action grid. States: loading (skeleton, aria-busy), error
 * (alert + retry), empty (status) and ready (PermissionsManager). After a sync
 * the signed-in user's own capability feed is invalidated.
 */
export function PermissionsPage({ api, labels, header, className, ...catalogOpts }: PermissionsPageProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const qc = useQueryClient()
  const cat = usePermissionsCatalog({ ...catalogOpts, loadBackendCatalog: api.loadPermissionModules })

  const handleSync = useCallback(
    async (roleId: string, capabilities: string[]) => {
      await api.syncRolePermissions(roleId, capabilities)
      await qc.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY })
    },
    [api, qc],
  )

  let body: ReactNode
  if (cat.isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-3 text-sm">
        <p className="text-destructive">{l.error}</p>
        <Button type="button" variant="outline" onClick={cat.retry}>
          {l.retry}
        </Button>
      </div>
    )
  } else if (cat.ready) {
    body = (
      <PermissionsManager
        title={l.title}
        loadModules={cat.loadModules}
        loadRoles={api.loadRoles}
        loadRolePermissions={api.loadRolePermissions}
        syncRolePermissions={handleSync}
        createRole={api.createRole}
        updateRole={api.updateRole}
        deleteRole={api.deleteRole}
      />
    )
  } else if (cat.isLoading) {
    body = (
      <div role="status" aria-busy="true" aria-label={l.loading} className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  } else {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        {l.empty}
      </p>
    )
  }

  return (
    <div className={className ?? 'h-full overflow-y-auto p-6'}>
      {header}
      {body}
    </div>
  )
}
