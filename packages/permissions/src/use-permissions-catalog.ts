/**
 * Builds the PermissionsManager catalog from the SAME nav the sidebar renders,
 * so the grid mirrors what users see. The backend supplies the actions per
 * model; the host nav decides which modules appear and how they group.
 */
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  GeneralPermissionDef,
  ModuleGroup,
  PermissionActionDef,
  PermissionModuleDef,
  PermissionsCatalog,
} from '@asteby/metacore-runtime-react'
import {
  screenKeyForUrl,
  type ScreenCapabilityRegistry,
} from './screen-capability-implies'
import type { NavGroupLike, NavItemLike } from './types'

const MODEL_URL_RE = /^\/m\/([^/?#]+)/

export interface BuildCatalogInput {
  /** Host navigation groups. */
  groups: NavGroupLike[]
  /** Extra module items (e.g. addon contributions). */
  extraItems?: NavItemLike[]
  /** Backend action catalog. */
  backend: PermissionsCatalog
  /** Title translator for nav titles. */
  translate?: (s: string) => string
  registry?: ScreenCapabilityRegistry
  /** Fallback screen action when no registry is given. */
  screenAction?: PermissionActionDef
}

const FALLBACK_SCREEN_ACTION: PermissionActionDef = {
  key: 'access',
  label: 'Access',
  icon: 'Eye',
  kind: 'screen',
}

/** Pure: crosses the nav with the backend action catalog. */
export function buildCatalogFromNav(input: BuildCatalogInput): {
  groups: ModuleGroup[]
  general: GeneralPermissionDef[]
} {
  const { backend, registry } = input
  const tr = input.translate ?? ((s: string) => s)
  const screenAction = registry?.screenAction() ?? input.screenAction ?? FALLBACK_SCREEN_ACTION
  const flat = 'groups' in backend ? backend.groups.flatMap((g) => g.modules) : backend.modules
  const actionsByKey = new Map<string, PermissionActionDef[]>()
  for (const m of flat) actionsByKey.set(m.key.toLowerCase(), m.actions)
  const general = backend.general ?? []

  const moduleForItem = (item: NavItemLike): PermissionModuleDef | null => {
    const url = typeof item.url === 'string' ? item.url : ''
    const icon = typeof item.icon === 'string' ? item.icon : undefined
    const m = MODEL_URL_RE.exec(url)
    if (m?.[1]) {
      const table = decodeURIComponent(m[1]).toLowerCase()
      const actions = actionsByKey.get(table)
      if (!actions || actions.length === 0) return null
      return { key: table, label: tr(item.title), icon, kind: 'model', actions }
    }
    if (!url || url === '#') return null
    const screenKey = screenKeyForUrl(url)
    return {
      key: screenKey,
      label: tr(item.title),
      icon,
      kind: 'screen',
      actions: [screenAction, ...(registry?.impliedShortcutActions(`${screenKey}.access`) ?? [])],
    }
  }

  const groups: ModuleGroup[] = []
  const pushGroup = (title: string, items: NavItemLike[]) => {
    const modules = items.map(moduleForItem).filter((x): x is PermissionModuleDef => x !== null)
    if (modules.length > 0) groups.push({ title, modules })
  }
  for (const g of input.groups) {
    const leaves: NavItemLike[] = []
    for (const item of g.items) {
      if (item.items && item.items.length > 0) pushGroup(tr(item.title), item.items)
      else leaves.push(item)
    }
    pushGroup(tr(g.title), leaves)
  }
  for (const item of input.extraItems ?? []) {
    if (item.items && item.items.length > 0) pushGroup(tr(item.title), item.items)
    else pushGroup(tr(item.title), [item])
  }
  const implied = registry?.buildImpliedApiModuleGroup()
  if (implied && implied.modules.length > 0) groups.push(implied)
  return { groups, general }
}

export interface UsePermissionsCatalogOptions {
  /** Live nav groups (the host's navigation query result). */
  groups: NavGroupLike[]
  extraItems?: NavItemLike[]
  /** Loads the backend catalog, usually `api.loadPermissionModules`. */
  loadBackendCatalog: () => Promise<PermissionsCatalog>
  translate?: (s: string) => string
  registry?: ScreenCapabilityRegistry
  /** Gate extra readiness (e.g. nav still loading). Default true. */
  navReady?: boolean
  queryKey?: readonly unknown[]
}

/**
 * Returns `{ loadModules, ready, isError, error, retry }`. Render the
 * PermissionsManager only when `ready` - it loads its catalog once on mount.
 */
export function usePermissionsCatalog(opts: UsePermissionsCatalogOptions) {
  const { groups, extraItems, loadBackendCatalog, translate, registry, navReady = true } = opts
  const q = useQuery({
    queryKey: opts.queryKey ?? ['permissions', 'modules', 'catalog'],
    queryFn: loadBackendCatalog,
    staleTime: 60_000,
  })
  const backend = q.data
  const catalog = useMemo(() => {
    if (!backend || !navReady) return { groups: [] as ModuleGroup[], general: [] as GeneralPermissionDef[] }
    return buildCatalogFromNav({ groups, extraItems, backend, translate, registry })
  }, [groups, extraItems, backend, translate, registry, navReady])
  const loadModules = useCallback(async (): Promise<PermissionsCatalog> => catalog, [catalog])
  const retry = useCallback(() => void q.refetch(), [q])
  return {
    loadModules,
    ready: catalog.groups.length > 0,
    isLoading: q.isLoading || !navReady,
    isError: q.isError,
    error: q.error,
    retry,
  }
}
