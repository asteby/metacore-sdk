import { describe, expect, it } from 'vitest'
import { buildLiveThinkStages } from './aby-live-think-stage'

describe('buildLiveThinkStages', () => {
  it('collapses consecutive cog ticks so other stages keep a slot', () => {
    const stages = buildLiveThinkStages([
      { content: 'sparkles|Recibí tu solicitud' },
      { content: 'cog|Pensando… (paso 1)' },
      { content: 'cog|Pensando… (paso 2)' },
      { content: 'brain|Ahora creo el cliente' },
      { content: 'package|create_record' },
    ])
    expect(stages.map((s) => s.key)).toEqual(['sparkles', 'cog', 'brain', 'package'])
    expect(stages[1]?.hint).toContain('paso 2')
  })

  it('uses amber for cog so the bar is not invisible zinc', () => {
    const stages = buildLiveThinkStages([{ content: 'cog|Pensando…' }])
    expect(stages[0]?.tone).toBe('amber')
  })
})
