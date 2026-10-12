/**
 * Screen -> implied model capabilities.
 *
 * A "screen" grant (`screen.<slug>.access`) can imply model CRUD capabilities
 * (declared by addon manifests as `requires_capabilities`). The host feeds the
 * map in (usually from `GET /permissions/modules` -> `screen_implies`); labels
 * are injected, nothing here knows about a specific addon or vertical.
 */
import type {
  ModuleGroup,
  PermissionActionDef,
  PermissionModuleDef,
} from '@asteby/metacore-runtime-react'

export interface ScreenCapabilityLabels {
  /** action key -> label (`index` -> "List / read"). Unknown keys render raw. */
  actions?: Record<string, string>
  /** module key -> label. Unknown keys render raw. */
  modules?: Record<string, string>
  /** module key -> section title for the shortcut badges. */
  groups?: Record<string, string>
  /** Section for modules not present in `groups`. */
  fallbackGroup?: string
  /** Title of the "implied API dependencies" catalog group. */
  impliedGroupTitle?: string
  /** Label of the per-screen access action. */
  screenAccess?: string
  /** Icon names understood by the PermissionsManager. */
  dependencyIcon?: string
}

const DEFAULT_ACTION_LABELS: Record<string, string> = {
  index: 'List / read',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
}

export interface ScreenCapabilityRegistry {
  set(map: Record<string, string[]> | null | undefined): void
  get(): Record<string, string[]>
  summarizeImpliedModules(screenAccessCap: string): string
  impliedShortcutActions(screenAccessCap: string): PermissionActionDef[]
  expand(grant: string[]): string[]
  buildImpliedApiModuleGroup(): ModuleGroup
  /** The screen "access" action definition (label injected). */
  screenAction(): PermissionActionDef
}

/** Route -> screen capability key: `/addons/x/y` -> `screen.addons.x.y`. */
export function screenKeyForUrl(url: string): string {
  const slug = url
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '.')
    .replace(/\.+$/, '')
    .toLowerCase()
  return `screen.${slug || 'root'}`
}

export function createScreenCapabilityRegistry(
  labels: ScreenCapabilityLabels = {},
): ScreenCapabilityRegistry {
  let implies: Record<string, string[]> = {}
  const actionLabels = { ...DEFAULT_ACTION_LABELS, ...labels.actions }
  const moduleLabels = labels.modules ?? {}
  const groups = labels.groups ?? {}
  const fallbackGroup = labels.fallbackGroup ?? 'Other APIs'
  const icon = labels.dependencyIcon ?? 'Link2'
  const split = (cap: string): [string, string] => {
    const dot = cap.indexOf('.')
    return dot > 0 ? [cap.slice(0, dot), cap.slice(dot + 1)] : [cap, cap]
  }

  return {
    set(map) {
      implies = map && typeof map === 'object' ? { ...map } : {}
    },
    get: () => ({ ...implies }),
    summarizeImpliedModules(cap) {
      const caps = implies[cap]
      if (!caps?.length) return ''
      const mods = new Set<string>()
      for (const c of caps) {
        const mod = c.split('.')[0]
        if (mod) mods.add(moduleLabels[mod] ?? mod)
      }
      return [...mods].sort((a, b) => a.localeCompare(b)).join(', ')
    },
    impliedShortcutActions(cap) {
      const caps = implies[cap]
      if (!caps?.length) return []
      return caps.map((c) => {
        const [mod, action] = split(c)
        return {
          key: c,
          label: moduleLabels[mod] ?? mod,
          description: actionLabels[action] ?? action,
          icon,
          kind: 'dependency',
          capability: c,
          group: groups[mod] ?? fallbackGroup,
        } as PermissionActionDef
      })
    },
    expand(grant) {
      const seen = new Set<string>()
      const out: string[] = []
      const add = (name: string) => {
        const n = name.trim()
        if (!n || seen.has(n)) return
        seen.add(n)
        out.push(n)
      }
      for (const name of grant) add(name)
      for (const name of grant) for (const i of implies[name] ?? []) add(i)
      return out
    },
    buildImpliedApiModuleGroup() {
      const byModule = new Map<string, Set<string>>()
      for (const caps of Object.values(implies)) {
        for (const c of caps) {
          if (c.indexOf('.') <= 0) continue
          const [mod, action] = split(c)
          let set = byModule.get(mod)
          if (!set) byModule.set(mod, (set = new Set()))
          set.add(action)
        }
      }
      const modules: PermissionModuleDef[] = [...byModule.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, actions]) => ({
          key,
          label: moduleLabels[key] ?? key,
          kind: 'model' as const,
          icon,
          actions: [...actions].sort().map((a) => ({
            key: a,
            label: actionLabels[a] ?? a,
            kind: 'crud' as const,
          })),
        }))
      return {
        title:
          labels.impliedGroupTitle ??
          'API dependencies - granted with screen access (not shown in the menu)',
        modules,
      }
    },
    screenAction: () => ({
      key: 'access',
      label: labels.screenAccess ?? 'Access',
      icon: 'Eye',
      kind: 'screen',
    }),
  }
}
