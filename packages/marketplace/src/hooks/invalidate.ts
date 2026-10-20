/**
 * Invalidate everything an addon install / upgrade / uninstall can change.
 *
 * The mutations used to refresh only the marketplace "installed" slice, so the
 * rest of the app (navigation, manifests, permissions, metadata, the addon's
 * own data queries) kept showing the previous world until a reload. This
 * invalidates, in one pass:
 *
 *   - the whole `marketplace` namespace (catalog entry, installed list);
 *   - any query whose key mentions the addon (exact key, or `<key>.`, `<key>:`,
 *     `<key>/` namespaced, or inside a `/addons/<key>/` path);
 *   - the shell roots an addon change can alter (navigation, manifests,
 *     permissions, capabilities, metadata, i18n, installed addons).
 *
 * `extraRoots` lets a host add its own shell query roots.
 */
import type { QueryClient } from '@tanstack/react-query'

export const ADDON_SHELL_QUERY_ROOTS: readonly string[] = [
  'marketplace',
  'metacore',
  'manifests',
  'navigation',
  'sidebar',
  'permissions',
  'capabilities',
  'metadata',
  'i18n',
  'installed-addons',
  'addons',
]

function strings(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || value == null) return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, depth + 1, out))
  else if (typeof value === 'object')
    Object.values(value as Record<string, unknown>).forEach((v) => strings(v, depth + 1, out))
  return out
}

/** True when a query key refers to the addon. */
export function queryKeyMentionsAddon(queryKey: readonly unknown[], addonKey: string): boolean {
  if (!addonKey) return false
  return strings(queryKey).some(
    (s) =>
      s === addonKey ||
      s.startsWith(`${addonKey}.`) ||
      s.startsWith(`${addonKey}:`) ||
      s.startsWith(`${addonKey}/`) ||
      s.includes(`/${addonKey}/`) ||
      s.endsWith(`/${addonKey}`),
  )
}

export function invalidateAddon(
  qc: Pick<QueryClient, 'invalidateQueries'>,
  addonKey: string,
  options: { extraRoots?: readonly string[] } = {},
): Promise<void> {
  const roots = new Set([...ADDON_SHELL_QUERY_ROOTS, ...(options.extraRoots ?? [])])
  return qc.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey as readonly unknown[]
      if (queryKeyMentionsAddon(key, addonKey)) return true
      const root = key[0]
      return typeof root === 'string' && roots.has(root)
    },
  })
}
