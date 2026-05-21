/**
 * Manifest normalization + permission diff utilities.
 *
 * Why normalize?
 *
 *   - v2 manifests only have `capabilities[]`.
 *   - v3 manifests split capabilities (what the runtime needs) and
 *     permissions (what the user is asked to consent to), and add
 *     `consents[]` for optional toggles.
 *
 * Every UI surface that asks the user to approve something must show ONE
 * coherent list, otherwise users get a v2 manifest "no permissions
 * requested" screen when in reality the runtime will call `http:fetch`.
 *
 * We collapse both shapes into a single ordered, de-duplicated
 * `permissions` list (capabilities + v3 permissions merged), preserving
 * the original `raw` payload for advanced renderers.
 */

import type {
  Capability,
  Manifest,
  ManifestApiVersion,
  Permission,
  PermissionDiffRow,
  RawManifest,
} from './types'

/** Stable identity for a capability/permission row — used by the differ. */
export function capabilityId(c: Capability | Permission): string {
  return `${c.kind}|${c.target}`
}

/**
 * Sort capabilities deterministically — by kind, then target, then reason.
 * Stable order keeps the consent UI from shuffling between renders when
 * the Hub returns the same set in a different order.
 */
function sortCaps(caps: Capability[]): Capability[] {
  return [...caps].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
    if (a.target !== b.target) return a.target < b.target ? -1 : 1
    const ar = a.reason ?? ''
    const br = b.reason ?? ''
    if (ar !== br) return ar < br ? -1 : 1
    return 0
  })
}

/**
 * Merge capabilities + permissions into one ordered list, de-duped by
 * (kind, target). When the same id appears in both lists, the v3
 * `permissions[]` entry wins (it's the canonical user-facing copy).
 */
function mergePermissions(
  caps: Capability[] | undefined,
  perms: Permission[] | undefined,
): Permission[] {
  const seen = new Map<string, Permission>()
  for (const c of caps ?? []) {
    seen.set(capabilityId(c), c)
  }
  for (const p of perms ?? []) {
    seen.set(capabilityId(p), p)
  }
  return sortCaps(Array.from(seen.values()))
}

/**
 * Normalize a v2 or v3 manifest into the unified shape used by every
 * marketplace component. Idempotent — calling it twice is a no-op.
 */
export function normalizeManifest(raw: RawManifest): Manifest {
  const apiVersion: ManifestApiVersion = raw.apiVersion
  const permissions =
    raw.apiVersion === '3'
      ? mergePermissions(raw.capabilities, raw.permissions)
      : mergePermissions(raw.capabilities, undefined)
  const consents = raw.apiVersion === '3' ? (raw.consents ?? []) : []

  return {
    key: raw.key,
    name: raw.name,
    version: raw.version,
    kernel: raw.kernel,
    description: raw.description,
    category: raw.category,
    author: raw.author,
    website: raw.website,
    license: raw.license,
    icon_type: raw.icon_type,
    icon_slug: raw.icon_slug,
    icon_color: raw.icon_color,
    apiVersion,
    permissions,
    consents,
    raw,
  }
}

/**
 * Compare the permission sets of two manifests and produce a row-by-row
 * diff. Rows are ordered: additions first, then modifications, then
 * removals, then unchanged. Stable within each bucket.
 *
 * The `current` argument is "what the user already approved" and `next`
 * is the version being installed/upgraded into. If `current` is null we
 * treat every row as `added` — useful for first-install consent screens.
 */
export function diffPermissions(
  current: Manifest | null,
  next: Manifest,
): PermissionDiffRow[] {
  const currentMap = new Map<string, Permission>()
  if (current) {
    for (const p of current.permissions) currentMap.set(capabilityId(p), p)
  }
  const nextMap = new Map<string, Permission>()
  for (const p of next.permissions) nextMap.set(capabilityId(p), p)

  const added: PermissionDiffRow[] = []
  const modified: PermissionDiffRow[] = []
  const removed: PermissionDiffRow[] = []
  const unchanged: PermissionDiffRow[] = []

  for (const [id, nextPerm] of nextMap) {
    const currentPerm = currentMap.get(id)
    if (!currentPerm) {
      added.push({ change: 'added', id, next: nextPerm })
      continue
    }
    if ((currentPerm.reason ?? '') !== (nextPerm.reason ?? '')) {
      modified.push({ change: 'modified', id, current: currentPerm, next: nextPerm })
    } else {
      unchanged.push({ change: 'unchanged', id, current: currentPerm, next: nextPerm })
    }
  }
  for (const [id, currentPerm] of currentMap) {
    if (!nextMap.has(id)) {
      removed.push({ change: 'removed', id, current: currentPerm })
    }
  }

  return [...added, ...modified, ...removed, ...unchanged]
}

/**
 * `true` when the diff contains any capability change that should force
 * a re-consent prompt during upgrade. Removals are not consent-relevant
 * (fewer caps = strictly safer) but additions and modifications are.
 */
export function diffRequiresConsent(rows: PermissionDiffRow[]): boolean {
  return rows.some((r) => r.change === 'added' || r.change === 'modified')
}
