import { describe, expect, it } from 'vitest'
import { normalizeProposal, normalizeProposals } from './proposals'

describe('normalizeProposal', () => {
  it('keeps title/summary', () => {
    expect(normalizeProposal({ id: 'a', title: 'T', summary: 'S' })).toMatchObject({ id: 'a', title: 'T', summary: 'S' })
  })
  it('derives title/summary from action/model/payload', () => {
    expect(normalizeProposal({ id: 1, action: 'create', model: 'finding', payload: { x: 1 } })).toMatchObject({
      id: '1',
      title: 'create · finding',
      summary: '{"x":1}',
      payload: { x: 1 },
    })
  })
  it('explicit title wins over action', () => {
    expect(normalizeProposal({ id: 'a', title: 'T', action: 'x' })?.title).toBe('T')
  })
  it('drops malformed rows', () => {
    expect(normalizeProposals([null, { title: 'no id' }, { id: 'a' }, { id: 'ok', action: 'x' }])).toHaveLength(1)
    expect(normalizeProposals('nope')).toBeUndefined()
  })
})
