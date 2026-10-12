import { describe, expect, it } from 'vitest'
import { abyCapabilities, hydrateAbyServerCapabilities } from './aby-capability-registry'

describe('hydrateAbyServerCapabilities', () => {
  it('does not throw on a transact row without requiresConfirmation and forces it', async () => {
    const n = await hydrateAbyServerCapabilities(async () => ({
      data: [
        { id: 'customers.price_types.create', owner: 'customers', title: 'T', description: 'D', kind: 'transact', risk: 'medium' },
        { id: 'x', owner: '', title: '', description: '', kind: 'answer', risk: 'none' },
      ] as never,
    }))
    expect(n).toBe(2)
    expect(abyCapabilities.get('customers.price_types.create')?.requiresConfirmation).toBe(true)
  })
})
