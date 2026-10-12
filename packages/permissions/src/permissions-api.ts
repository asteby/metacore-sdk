/**
 * Permissions transport. Everything goes through an injected HTTP client so the
 * package works with any axios-like instance and any route layout.
 */
import type {
  GeneralPermissionDef,
  PermissionModuleDef,
  PermissionsCatalog,
  RoleDef,
  RoleInput,
} from '@asteby/metacore-runtime-react'
import type { ScreenCapabilityRegistry } from './screen-capability-implies'
import type { PermissionsHttpClient } from './types'

export interface MyPermissions {
  permissions: string[]
  role: string
  isAdmin: boolean
}

export const MY_PERMISSIONS_QUERY_KEY = ['permissions', 'me'] as const

/** Per-user key: SPA account switches never reuse another session's caps. */
export function myPermissionsQueryKey(userId: string | undefined | null) {
  return [...MY_PERMISSIONS_QUERY_KEY, userId ?? 'anon'] as const
}

export interface PermissionsApiPaths {
  me: string
  modules: string
  roles: string
  /** `:id` is appended. */
  rolePermissions: string
}

export const DEFAULT_PERMISSIONS_PATHS: PermissionsApiPaths = {
  me: '/permissions/me',
  modules: '/permissions/modules',
  roles: '/data/roles/me',
  rolePermissions: '/permissions/role',
}

export interface PermissionsApiOptions {
  http: PermissionsHttpClient
  paths?: Partial<PermissionsApiPaths>
  /** Registry fed by `screen_implies` and used to expand grants. Optional. */
  registry?: ScreenCapabilityRegistry
  /** Default icon for new roles. */
  defaultRoleIcon?: string
}

const CRUD_ACTION_KEYS = new Set(['index', 'create', 'update', 'delete', 'export', 'import'])

interface LegacyModule {
  key: string
  label?: string
  actions?: string[]
  actionLabels?: Record<string, string>
  actionIcons?: Record<string, string>
}

interface RoleRow {
  id: string
  name: string
  label?: string
  color?: string
  icon?: string
}

function toRoleDef(row: RoleRow): RoleDef {
  return {
    id: row.id,
    name: row.name,
    label: row.label || undefined,
    color: row.color || undefined,
    icon: row.icon || undefined,
  }
}

function asRole(data: unknown): RoleDef | undefined {
  const body = data as { data?: unknown } | undefined
  const row = (body?.data ?? body) as RoleRow | undefined
  if (row && typeof row.id === 'string' && typeof row.name === 'string') return toRoleDef(row)
  return undefined
}

export interface PermissionsApi {
  fetchMyPermissions(): Promise<MyPermissions>
  loadPermissionModules(): Promise<PermissionsCatalog>
  loadRoles(): Promise<RoleDef[]>
  createRole(input: RoleInput): Promise<RoleDef | void>
  updateRole(roleId: string, input: RoleInput): Promise<RoleDef | void>
  deleteRole(roleId: string): Promise<void>
  loadRolePermissions(roleId: string): Promise<string[]>
  syncRolePermissions(roleId: string, capabilities: string[]): Promise<void>
}

export function createPermissionsApi(opts: PermissionsApiOptions): PermissionsApi {
  const { http, registry } = opts
  const paths = { ...DEFAULT_PERMISSIONS_PATHS, ...opts.paths }
  const expand = (caps: string[]) => (registry ? registry.expand(caps) : caps)

  return {
    async fetchMyPermissions() {
      const res = await http.get(paths.me)
      const body = (res.data ?? {}) as {
        permissions?: unknown
        role?: unknown
        isAdmin?: unknown
        is_admin?: unknown
      }
      return {
        permissions: Array.isArray(body.permissions) ? (body.permissions as string[]) : [],
        role: typeof body.role === 'string' ? body.role : '',
        // accept both casings so either side of a backend rollout works
        isAdmin: Boolean(body.isAdmin ?? body.is_admin),
      }
    },

    /**
     * Accepts `{ modules, general, screen_implies }` (current contract) or the
     * legacy `{ data: [{key, actions[]}] }` array.
     */
    async loadPermissionModules() {
      const res = await http.get(paths.modules)
      const body = (res.data ?? {}) as {
        data?: unknown
        modules?: unknown
        general?: unknown
        screen_implies?: unknown
      }
      if (body.screen_implies && typeof body.screen_implies === 'object') {
        registry?.set(body.screen_implies as Record<string, string[]>)
      }
      const general: GeneralPermissionDef[] = Array.isArray(body.general)
        ? (body.general as GeneralPermissionDef[])
        : []
      if (Array.isArray(body.modules) && body.modules.length > 0) {
        return { modules: body.modules as PermissionModuleDef[], general }
      }
      const legacy = Array.isArray(body.data) ? (body.data as LegacyModule[]) : []
      return {
        modules: legacy.map(
          (m): PermissionModuleDef => ({
            key: m.key,
            label: m.label || m.key,
            actions: (m.actions ?? []).map((key) => ({
              key,
              label: m.actionLabels?.[key] || key,
              icon: m.actionIcons?.[key],
              kind: CRUD_ACTION_KEYS.has(key) ? 'crud' : 'custom',
            })),
          }),
        ),
        general,
      }
    },

    async loadRoles() {
      const res = await http.get(paths.roles)
      const body = res.data as { data?: unknown } | undefined
      const rows = body?.data ?? body
      return (Array.isArray(rows) ? (rows as RoleRow[]) : []).map(toRoleDef)
    },

    async createRole(input) {
      const res = await http.post(paths.roles, {
        name: input.name,
        label: input.label ?? input.name,
        color: input.color ?? '',
        icon: input.icon ?? opts.defaultRoleIcon ?? 'Shield',
      })
      return asRole(res.data)
    },

    async updateRole(roleId, input) {
      const res = await http.put(`${paths.roles}/${encodeURIComponent(roleId)}`, {
        name: input.name,
        label: input.label ?? input.name,
        color: input.color ?? '',
        icon: input.icon ?? '',
      })
      return asRole(res.data)
    },

    async deleteRole(roleId) {
      await http.delete(`${paths.roles}/${encodeURIComponent(roleId)}`)
    },

    async loadRolePermissions(roleId) {
      const res = await http.get(`${paths.rolePermissions}/${encodeURIComponent(roleId)}`)
      const data = (res.data as { data?: unknown } | undefined)?.data
      return expand(Array.isArray(data) ? (data as string[]) : [])
    },

    /** Full-replace sync; screen access grants are expanded to their deps. */
    async syncRolePermissions(roleId, capabilities) {
      await http.post(`${paths.rolePermissions}/${encodeURIComponent(roleId)}/sync`, {
        permissions: expand(capabilities),
      })
    },
  }
}
