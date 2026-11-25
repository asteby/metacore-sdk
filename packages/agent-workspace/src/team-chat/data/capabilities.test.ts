import { describe, expect, it } from 'vitest'
import { DEFAULT_CHANNEL_CAPABILITIES, resolveChannelCapabilities } from './capabilities'
import { supportCaseFromAttachment } from './types'

const ALL_ON = { calls: true, reactions: true, replies: true, attachments: true }

describe('resolveChannelCapabilities', () => {
  it('defaults leave everything on (a channel without the key behaves as before)', () => {
    expect(DEFAULT_CHANNEL_CAPABILITIES).toEqual(ALL_ON)
    expect(resolveChannelCapabilities(undefined)).toEqual(ALL_ON)
    expect(resolveChannelCapabilities(null)).toEqual(ALL_ON)
    expect(resolveChannelCapabilities({})).toEqual(ALL_ON)
    expect(resolveChannelCapabilities({ capabilities: null })).toEqual(ALL_ON)
    expect(resolveChannelCapabilities({ capabilities: {} })).toEqual(ALL_ON)
  })

  it('only an explicit false turns a capability off; the rest keep their default', () => {
    expect(resolveChannelCapabilities({ capabilities: { calls: false, reactions: false } })).toEqual({
      ...ALL_ON,
      calls: false,
      reactions: false,
    })
    expect(resolveChannelCapabilities({ capabilities: { attachments: false } }).attachments).toBe(false)
  })

  it('ignores unknown keys and non-boolean values', () => {
    const caps = resolveChannelCapabilities({
      capabilities: { calls: 0, reactions: 'no', replies: null, typing: false } as never,
    })
    expect(caps).toEqual(ALL_ON)
  })

  it('does not mutate the defaults', () => {
    resolveChannelCapabilities({ capabilities: { calls: false } })
    expect(DEFAULT_CHANNEL_CAPABILITIES.calls).toBe(true)
  })
})

describe('supportCaseFromAttachment', () => {
  it('maps a valid support_case attachment', () => {
    expect(
      supportCaseFromAttachment({ type: 'support_case', status: 'resolved', folio: 'OPS-1', subject: ' Asunto ', solution: 'Listo' }),
    ).toEqual({ status: 'resolved', folio: 'OPS-1', subject: 'Asunto', solution: 'Listo' })
  })
  it('rejects other types, unknown statuses and a missing folio (falls back to the text body)', () => {
    expect(supportCaseFromAttachment({ type: 'record', status: 'open', folio: 'X' })).toBeNull()
    expect(supportCaseFromAttachment({ type: 'support_case', status: 'weird', folio: 'X' })).toBeNull()
    expect(supportCaseFromAttachment({ type: 'support_case', status: 'open' })).toBeNull()
    expect(supportCaseFromAttachment({ type: 'support_case', status: 'open', folio: '  ' })).toBeNull()
  })
})
