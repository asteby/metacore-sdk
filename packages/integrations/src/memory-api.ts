import type {
  CatalogEvent,
  InboundContract,
  InboundEndpoint,
  IntegrationsApi,
  LogEntry,
  Subscription,
} from './types'

export interface MemoryApiSeed {
  events?: CatalogEvent[]
  contracts?: InboundContract[]
  subscriptions?: Subscription[]
  inbound?: InboundEndpoint[]
  log?: LogEntry[]
}

/** Example catalog in the shape the kernel `v3.Catalog` returns. */
export const EXAMPLE_EVENTS: CatalogEvent[] = [
  {
    addon: 'sales',
    addon_name: 'Ventas',
    name: 'sales.order.created',
    description: 'Pedido creado',
    aggregate: 'order',
    sensitivity: 'personal',
    payload_schema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        total: { type: 'number', example: 1250.5 },
        customer: {
          type: 'object',
          properties: { name: { type: 'string', example: 'Ana Pérez' }, email: { type: 'string', format: 'email' } },
        },
      },
    },
  },
  { addon: 'sales', addon_name: 'Ventas', name: 'sales.order.cancelled', sensitivity: 'internal', aggregate: 'order' },
  {
    addon: 'crm',
    addon_name: 'CRM',
    name: 'crm.contact.created',
    sensitivity: 'personal',
    payload_schema: { type: 'object', properties: { id: { type: 'string' }, phone: { type: 'string' } } },
  },
]

/**
 * In-memory `IntegrationsApi` for demos, storybook-style playgrounds and the
 * package tests. It also documents the contract: credentials are returned
 * once from save/rotate and never stored in readable form.
 */
export function createMemoryIntegrationsApi(seed: MemoryApiSeed = {}): IntegrationsApi & { calls: string[] } {
  const calls: string[] = []
  const events = seed.events ?? EXAMPLE_EVENTS
  const subs = [...(seed.subscriptions ?? [])]
  const inbound = [...(seed.inbound ?? [])]
  const log = [...(seed.log ?? [])]
  let n = 0
  const secret = () => `mcs_${(++n).toString(16).padStart(8, '0')}${'x'.repeat(24)}`

  return {
    calls,
    async listEvents() {
      calls.push('listEvents')
      return events
    },
    async listSubscriptions() {
      calls.push('listSubscriptions')
      return subs.map((s) => ({ ...s }))
    },
    async saveSubscription(draft) {
      calls.push('saveSubscription')
      const { credential, ...rest } = draft
      const item: Subscription = { ...rest, id: rest.id ?? `sub_${++n}`, has_credential: rest.has_credential || !!credential }
      const i = subs.findIndex((s) => s.id === item.id)
      if (i >= 0) subs[i] = item
      else subs.push(item)
      return { item }
    },
    async deleteSubscription(id) {
      calls.push('deleteSubscription')
      const i = subs.findIndex((s) => s.id === id)
      if (i >= 0) subs.splice(i, 1)
    },
    async test(target) {
      calls.push('test')
      return { ok: true, http_status: 200, duration_ms: 42, body: 'draft' in target ? target.sample : undefined }
    },
    async listInboundContracts() {
      calls.push('listInboundContracts')
      return seed.contracts ?? [{ key: 'crm-cliente-nuevo', name: 'CRM: cliente nuevo', source: 'template' }]
    },
    async listInbound() {
      calls.push('listInbound')
      return inbound.map((e) => ({ ...e }))
    },
    async saveInbound(draft) {
      calls.push('saveInbound')
      const isNew = !draft.id
      const item: InboundEndpoint = {
        ...draft,
        id: draft.id ?? `in_${++n}`,
        url: draft.url ?? `https://ops.example/in/${n}`,
        has_credential: true,
      }
      const i = inbound.findIndex((e) => e.id === item.id)
      if (i >= 0) inbound[i] = item
      else inbound.push(item)
      return isNew ? { item, credential: { value: secret() } } : { item }
    },
    async rotateInboundCredential() {
      calls.push('rotateInboundCredential')
      return { value: secret() }
    },
    async deleteInbound(id) {
      calls.push('deleteInbound')
      const i = inbound.findIndex((e) => e.id === id)
      if (i >= 0) inbound.splice(i, 1)
    },
    async listLog(query) {
      calls.push('listLog')
      return {
        items: log.filter((l) => (!query.direction || l.direction === query.direction) && (!query.status || l.status === query.status)),
      }
    },
    async replay(id) {
      calls.push(`replay:${id}`)
      const e = log.find((l) => l.id === id)
      if (e) e.status = 'pending'
    },
    async queueStatus() {
      return { pending: log.filter((l) => l.status === 'pending').length, failed: log.filter((l) => l.status === 'failed').length }
    },
    async listModels() {
      return ['customers', 'orders']
    },
    async listCommands() {
      return ['inventory.recount']
    },
    async listNotifyTemplates() {
      return ['cliente_importado']
    },
  }
}
