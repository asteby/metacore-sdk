export type AbyCapabilityKind = 'answer' | 'guide' | 'act' | 'transact'
export type AbyCapabilityRisk = 'none' | 'low' | 'medium' | 'high' | 'critical'

export type AbyCapability = {
  /** Globally stable: `<owner>.<domain>.<verb>`. */
  id: string
  owner: string
  title: string
  description: string
  kind: AbyCapabilityKind
  risk: AbyCapabilityRisk
  permission?: string
  route?: string
  guideId?: string
  inputSchema?: Record<string, unknown>
  requiresConfirmation?: boolean
  reversible?: boolean
  tags?: string[]
  execute?: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>
}

export type CapabilityExecutionOptions = {
  signal?: AbortSignal
  confirm?: (capability: AbyCapability, input: Record<string, unknown>) => Promise<boolean>
}

type CapabilityListener = (capabilities: AbyCapability[]) => void

function validateCapability(capability: AbyCapability): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(capability.id)) {
    throw new Error(`Invalid capability id: ${capability.id}`)
  }
  if (!capability.owner || !capability.title || !capability.description) {
    throw new Error(`Capability ${capability.id} needs owner, title and description`)
  }
  if (capability.kind === 'transact' && !capability.requiresConfirmation) {
    throw new Error(`Transactional capability ${capability.id} must require confirmation`)
  }
}

class AbyCapabilityRegistry {
  private capabilities = new Map<string, AbyCapability>()
  private listeners = new Set<CapabilityListener>()

  register(capability: AbyCapability): () => void {
    validateCapability(capability)
    const previous = this.capabilities.get(capability.id)
    if (previous && previous.owner !== capability.owner) {
      throw new Error(`Capability ${capability.id} is already owned by ${previous.owner}`)
    }
    const registered = Object.freeze({ ...capability })
    this.capabilities.set(capability.id, registered)
    this.emit()
    return () => {
      if (this.capabilities.get(capability.id) !== registered) return
      this.capabilities.delete(capability.id)
      this.emit()
    }
  }

  registerMany(capabilities: AbyCapability[]): () => void {
    const cleanups: Array<() => void> = []
    try {
      capabilities.forEach((capability) => cleanups.push(this.register(capability)))
    } catch (error) {
      cleanups.reverse().forEach((cleanup) => cleanup())
      throw error
    }
    return () => cleanups.reverse().forEach((cleanup) => cleanup())
  }

  list(filter?: Partial<Pick<AbyCapability, 'owner' | 'kind' | 'risk'>>): AbyCapability[] {
    return [...this.capabilities.values()]
      .filter((capability) => !filter || Object.entries(filter).every(([key, value]) => capability[key as keyof AbyCapability] === value))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  get(id: string): AbyCapability | undefined {
    return this.capabilities.get(id)
  }

  subscribe(listener: CapabilityListener): () => void {
    this.listeners.add(listener)
    listener(this.list())
    return () => this.listeners.delete(listener)
  }

  async execute(
    id: string,
    input: Record<string, unknown> = {},
    options: CapabilityExecutionOptions = {},
  ): Promise<unknown> {
    const capability = this.capabilities.get(id)
    if (!capability) throw new Error(`Unknown capability: ${id}`)
    if (!capability.execute) throw new Error(`Capability ${id} is not executable in this context`)
    if (capability.requiresConfirmation) {
      if (!options.confirm || !(await options.confirm(capability, input))) {
        throw new DOMException('User confirmation required', 'NotAllowedError')
      }
    }
    window.dispatchEvent(new CustomEvent('ops:aby-capability-started', { detail: { id, risk: capability.risk } }))
    try {
      const result = await capability.execute(input, options.signal)
      window.dispatchEvent(new CustomEvent('ops:aby-capability-completed', { detail: { id } }))
      return result
    } catch (error) {
      window.dispatchEvent(new CustomEvent('ops:aby-capability-failed', { detail: { id, error: String(error) } }))
      throw error
    }
  }

  private emitQueued = false

  // Coalesced: the sidebar re-registers one synthetic guide per model on every
  // nav change, and a sorted snapshot per register made that O(n² log n) on
  // the main thread. Listeners get one final snapshot per microtask.
  private emit(): void {
    if (this.emitQueued) return
    this.emitQueued = true
    queueMicrotask(() => {
      this.emitQueued = false
      const snapshot = this.list()
      this.listeners.forEach((listener) => listener(snapshot))
      window.dispatchEvent(new CustomEvent('ops:aby-capabilities-changed', { detail: { count: snapshot.length } }))
    })
  }
}

export const abyCapabilities = new AbyCapabilityRegistry()
let serverCapabilityCleanups: Array<() => void> = []

declare global {
  interface Window {
    opsCapabilities: Pick<AbyCapabilityRegistry, 'register' | 'registerMany' | 'list' | 'get' | 'subscribe' | 'execute'>
  }
}

export function bootstrapAbyCapabilities(): void {
  window.opsCapabilities = abyCapabilities
}

export async function hydrateAbyServerCapabilities(
  fetchCatalog: () => Promise<{ data?: { data?: AbyCapability[] } | AbyCapability[] }>,
): Promise<number> {
  let response: { data?: { data?: AbyCapability[] } | AbyCapability[] }
  try {
    response = await fetchCatalog()
  } catch {
    return 0
  }
  const payload = response.data
  const rows = (Array.isArray(payload) ? payload : payload?.data) ?? []
  serverCapabilityCleanups.reverse().forEach((cleanup) => cleanup())
  serverCapabilityCleanups = []
  for (const capability of rows) {
    // Server catalogs may omit the flag on transactional rows. Fail safe (always
    // confirm) and never let one bad row abort hydration as an unhandled error.
    const safe =
      capability.kind === 'transact' && !capability.requiresConfirmation
        ? { ...capability, requiresConfirmation: true }
        : capability
    try {
      serverCapabilityCleanups.push(abyCapabilities.register(safe))
    } catch {
      /* invalid row (id/owner/title): skip it */
    }
  }
  return rows.length
}

export function clearAbyServerCapabilities(): void {
  serverCapabilityCleanups.reverse().forEach((cleanup) => cleanup())
  serverCapabilityCleanups = []
}

export function installAbyCapabilityAuditBridge(
  report: (event: {
    capability_id: string
    event: string
    risk?: string
    metadata?: Record<string, unknown>
  }) => void,
): () => void {
  const bindings: Array<[string, EventListener]> = []
  const bind = (type: string, eventName: string, resolveId: (detail: Record<string, unknown>) => string) => {
    const listener: EventListener = (raw) => {
      const detail = ((raw as CustomEvent).detail ?? {}) as Record<string, unknown>
      const id = resolveId(detail)
      if (!id) return
      report({
        capability_id: id,
        event: eventName,
        risk: typeof detail.risk === 'string' ? detail.risk : undefined,
        metadata: typeof detail.reason === 'string' ? { reason: detail.reason } : undefined,
      })
    }
    window.addEventListener(type, listener)
    bindings.push([type, listener])
  }
  const capabilityId = (detail: Record<string, unknown>) => String(detail.id ?? '')
  const guideCapabilityId = (detail: Record<string, unknown>) => {
    const guideId = String(detail.guideId ?? '')
    return abyCapabilities.list({ kind: 'guide' }).find((capability) => capability.guideId === guideId)?.id ?? guideId
  }
  bind('ops:aby-capability-started', 'started', capabilityId)
  bind('ops:aby-capability-completed', 'completed', capabilityId)
  bind('ops:aby-capability-failed', 'failed', capabilityId)
  bind('ops:aby-guide-started', 'guide_started', guideCapabilityId)
  bind('ops:aby-guide-completed', 'guide_completed', guideCapabilityId)
  bind('ops:aby-guide-error', 'guide_error', guideCapabilityId)
  return () => bindings.forEach(([type, listener]) => window.removeEventListener(type, listener))
}
