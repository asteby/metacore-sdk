import { describe, expect, it } from 'vitest'
import { applicableFields, missingRequired, visibleSections } from './connector-form-model'

// connector_email: provider picks which API key applies; each provider lives in
// its own section gated by visible_when.
const sections = [
  { key: 'provider' },
  { key: 'connection_resend', visible_when: { field: 'provider', equals: 'resend' } },
  { key: 'connection_sendgrid', visible_when: { field: 'provider', equals: 'sendgrid' } },
  { key: 'identity' },
]
const fields = [
  { key: 'provider', type: 'select', required: true, default: 'resend', section: 'provider' },
  { key: 'api_key', type: 'secret', required: true, section: 'connection_resend' },
  { key: 'sendgrid_api_key', type: 'secret', required: true, section: 'connection_sendgrid' },
  { key: 'from_address', type: 'string', required: true, section: 'identity' },
]
const defaults = { provider: 'resend' }

describe('conditional credential fields', () => {
  it('provider=resend with sendgrid_api_key empty saves (hidden field is not required)', () => {
    const values = { provider: 'resend', api_key: 're_123', from_address: 'a@b.mx' }
    const active = applicableFields(fields, sections, values, defaults)
    expect(active.map((f) => f.key)).toEqual(['provider', 'api_key', 'from_address'])
    expect(missingRequired(active, values, false)).toEqual([])
    // The old behaviour (every declared field) is what produced the bug.
    expect(missingRequired(fields, values, false)).toContain('sendgrid_api_key')
  })

  it('the default provider applies when the value is blank', () => {
    const active = applicableFields(fields, sections, { from_address: 'a@b.mx' }, defaults)
    expect(active.map((f) => f.key)).toContain('api_key')
    expect(active.map((f) => f.key)).not.toContain('sendgrid_api_key')
  })

  it('switching to sendgrid requires ITS key and not the Resend one', () => {
    const values = { provider: 'sendgrid', from_address: 'a@b.mx' }
    const active = applicableFields(fields, sections, values, defaults)
    expect(missingRequired(active, values, false)).toEqual(['sendgrid_api_key'])
  })

  it('hides sections (wizard steps) of the other providers', () => {
    expect(visibleSections(sections, { provider: 'resend' }, defaults).map((s) => s.key)).toEqual([
      'provider',
      'connection_resend',
      'identity',
    ])
  })

  it('honours a field-level visible_when (in)', () => {
    const f = [
      { key: 'mode', required: true, default: 'a' },
      { key: 'extra', required: true, visible_when: { field: 'mode', in: ['b', 'c'] } },
    ]
    expect(applicableFields(f, [], { mode: 'a' }, { mode: 'a' }).map((x) => x.key)).toEqual(['mode'])
    expect(applicableFields(f, [], { mode: 'b' }).map((x) => x.key)).toEqual(['mode', 'extra'])
  })
})
