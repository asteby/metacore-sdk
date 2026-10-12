import { describe, expect, it, vi } from 'vitest'

vi.mock('./aby-chart-embed', () => ({ AbyChartEmbed: () => null }))

import { resolveAgentResultRenderer } from '@asteby/metacore-runtime-react'
import { agentResultsOf } from './agent-results'
import type { AbyProposal } from './aby-proposal-card'

const proposal = (id: string) => ({ id, model: 'products', status: 'pending' }) as unknown as AbyProposal

describe('agentResultsOf', () => {
  it('maps embeds by type, then the guide, then one plan for several proposals', () => {
    const results = agentResultsOf({
      embeds: [
        { type: 'count', model: 'products', count: 0 },
        { type: 'record', model: 'warehouses', id: 'w-1' },
      ] as never,
      guide: { id: 'g', title: 'Crear producto' } as never,
      proposals: [proposal('a'), proposal('b')],
    })
    expect(results.map((r) => r.kind)).toEqual(['count', 'record', 'guide', 'plan'])
    expect(results[0]!.model).toBe('products')
  })

  it('keeps a single proposal as a proposal card', () => {
    expect(agentResultsOf({ proposals: [proposal('a')] }).map((r) => r.kind)).toEqual(['proposal'])
  })

  it('registers a renderer for every kind the host emits', () => {
    for (const kind of ['record', 'view', 'count', 'chart', 'image', 'proposal', 'plan', 'guide']) {
      expect(resolveAgentResultRenderer({ kind })).toBeTypeOf('function')
    }
  })
})
