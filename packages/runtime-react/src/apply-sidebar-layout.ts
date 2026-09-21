/**
 * apply-sidebar-layout — pure overlay of an org sidebar layout onto a live
 * catalog of leaves. Mirrors ops `services.ApplySidebarLayout` (Go). See
 * CONTRACT-ORG-SIDEBAR-LAYOUT.md.
 */

export type SidebarNodeType = 'group' | 'folder' | 'leaf'

export interface SidebarLayoutNode {
  type: SidebarNodeType
  key?: string
  title?: string
  icon?: string
  ref?: string
  hidden?: boolean
  children?: SidebarLayoutNode[]
}

export interface SidebarLayoutDoc {
  version?: number
  tree: SidebarLayoutNode[]
}

export interface CatalogLeaf {
  ref: string
  title: string
  url: string
  icon?: string
  /** Optional alternate refs that resolve to the same leaf. */
  aliases?: string[]
}

export interface AppliedNavItem {
  title: string
  url: string
  icon?: string
  ref?: string
  folderKey?: string
  items?: AppliedNavItem[]
}

export interface AppliedNavGroup {
  title: string
  icon?: string
  items: AppliedNavItem[]
}

/** Normalize a nav URL/path for stable refs. */
export function normalizeNavPath(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed) return '/'
  try {
    const u = new URL(trimmed, 'http://local.invalid')
    let path = u.pathname || '/'
    if (path !== '/') path = path.replace(/\/+$/, '')
    return u.search ? `${path}${u.search}` : path
  } catch {
    return trimmed.replace(/\/+$/, '') || '/'
  }
}

export function coreRefKey(url: string): string {
  return `core:${normalizeNavPath(url)}`
}

export function addonModelRefKey(addonKey: string, table: string, query = ''): string {
  let ref = `addon:${addonKey.trim()}/model:${table.trim().toLowerCase()}`
  const q = query.replace(/^\?/, '').trim()
  if (q) ref += `?${q}`
  return ref
}

export function addonUrlRefKey(addonKey: string, path: string): string {
  return `addon:${addonKey.trim()}/url:${normalizeNavPath(path)}`
}

export function urlRefKey(url: string): string {
  return `url:${normalizeNavPath(url)}`
}

export function folderAccessCapability(folderKey: string): string {
  return `folder.${folderKey}.access`
}

/**
 * Pick the best stable ref for a live nav leaf.
 * Prefer addon-aware forms when metadata is known; fall back to url:/core:.
 */
export function leafRefFor(
  url: string,
  meta?: { addonKey?: string; model?: string },
): string {
  const path = normalizeNavPath(url)
  if (meta?.addonKey && meta?.model) {
    const q = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    return addonModelRefKey(meta.addonKey, meta.model, q)
  }
  const addonMatch = /^\/addons\/([^/]+)(?:\/(.*))?$/.exec(path.split('?')[0] ?? '')
  if (addonMatch) {
    const rest = addonMatch[2] ? `/${addonMatch[2]}` : '/'
    const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''
    return addonUrlRefKey(addonMatch[1], rest + q)
  }
  if (path.startsWith('/m/')) return urlRefKey(path)
  return coreRefKey(path)
}

function indexCatalog(catalog: CatalogLeaf[]): Map<string, CatalogLeaf> {
  const map = new Map<string, CatalogLeaf>()
  for (const leaf of catalog) {
    if (!leaf.ref) continue
    map.set(leaf.ref, leaf)
    for (const a of leaf.aliases ?? []) map.set(a, leaf)
    // Always index by url: form so layouts saved with either scheme resolve.
    map.set(urlRefKey(leaf.url), leaf)
    if (!leaf.url.startsWith('/m/') && !leaf.url.startsWith('/addons/')) {
      map.set(coreRefKey(leaf.url), leaf)
    }
  }
  return map
}

/**
 * Apply an org layout onto a catalog. Returns `null` when the tree is empty
 * (caller keeps the default merge).
 */
export function applySidebarLayout(
  catalog: CatalogLeaf[],
  tree: SidebarLayoutNode[] | undefined | null,
): AppliedNavGroup[] | null {
  if (!tree || tree.length === 0) return null
  const byRef = indexCatalog(catalog)
  const groups: AppliedNavGroup[] = []

  for (const n of tree) {
    if (n.hidden) continue
    switch (n.type) {
      case 'group': {
        const items = applyChildren(n.children ?? [], byRef)
        if (items.length === 0) break
        groups.push({ title: n.title || n.key || '', icon: n.icon, items })
        break
      }
      case 'folder': {
        const item = applyFolder(n, byRef)
        if (!item) break
        groups.push({ title: n.title || n.key || '', icon: n.icon, items: [item] })
        break
      }
      case 'leaf': {
        const item = applyLeaf(n, byRef)
        if (item) groups.push({ title: 'sidebar.general', items: [item] })
        break
      }
    }
  }
  return groups.length > 0 ? groups : null
}

function applyChildren(
  nodes: SidebarLayoutNode[],
  byRef: Map<string, CatalogLeaf>,
): AppliedNavItem[] {
  const out: AppliedNavItem[] = []
  for (const n of nodes) {
    if (n.hidden) continue
    if (n.type === 'folder') {
      const item = applyFolder(n, byRef)
      if (item) out.push(item)
    } else if (n.type === 'leaf') {
      const item = applyLeaf(n, byRef)
      if (item) out.push(item)
    }
  }
  return out
}

function applyFolder(
  n: SidebarLayoutNode,
  byRef: Map<string, CatalogLeaf>,
): AppliedNavItem | null {
  const children = applyChildren(n.children ?? [], byRef)
  if (children.length === 0) return null
  return {
    title: n.title || n.key || '',
    url: children[0]?.url ?? '#',
    icon: n.icon,
    folderKey: n.key,
    items: children,
  }
}

function applyLeaf(
  n: SidebarLayoutNode,
  byRef: Map<string, CatalogLeaf>,
): AppliedNavItem | null {
  if (!n.ref) return null
  const leaf = byRef.get(n.ref)
  if (!leaf) return null
  return {
    title: n.title?.trim() ? n.title : leaf.title,
    url: leaf.url,
    icon: n.icon || leaf.icon,
    ref: n.ref,
  }
}

/** Collect folder keys from a tree (for permissions catalog). */
export function collectFolderKeys(tree: SidebarLayoutNode[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (nodes: SidebarLayoutNode[]) => {
    for (const n of nodes) {
      if (n.type === 'folder' && n.key && !seen.has(n.key)) {
        seen.add(n.key)
        out.push(n.key)
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree)
  return out
}

const FOLDER_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/

export function slugifyFolderKey(title: string): string {
  let s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!s) s = 'folder'
  if (s.length > 40) s = s.slice(0, 40)
  if (!/^[a-z]/.test(s)) s = `f_${s}`.slice(0, 40)
  return s
}

export function isValidFolderKey(key: string): boolean {
  return FOLDER_KEY_RE.test(key)
}

/**
 * Build a default layout tree from the live nav groups (one group node per
 * section, leaves + existing collapsibles as folders). Used by the editor
 * "start from current sidebar" action.
 */
export function layoutTreeFromNavGroups(
  groups: Array<{
    title: string
    items: Array<{
      title: string
      url: string
      icon?: string
      items?: Array<{ title: string; url: string; icon?: string; items?: unknown[] }>
      folderKey?: string
      ref?: string
    }>
  }>,
  refFor: (url: string) => string = (u) => leafRefFor(u),
): SidebarLayoutNode[] {
  return groups.map((g) => ({
    type: 'group' as const,
    key: g.title,
    title: g.title,
    children: g.items.map((it) => {
      if (it.items && it.items.length > 0) {
        const key = it.folderKey || slugifyFolderKey(it.title)
        return {
          type: 'folder' as const,
          key,
          title: it.title,
          icon: typeof it.icon === 'string' ? it.icon : undefined,
          children: it.items.map((child) => ({
            type: 'leaf' as const,
            ref: (child as { ref?: string }).ref || refFor(child.url),
            title: child.title,
            icon: typeof child.icon === 'string' ? child.icon : undefined,
          })),
        }
      }
      return {
        type: 'leaf' as const,
        ref: it.ref || refFor(it.url),
        title: it.title,
        icon: typeof it.icon === 'string' ? it.icon : undefined,
      }
    }),
  }))
}
