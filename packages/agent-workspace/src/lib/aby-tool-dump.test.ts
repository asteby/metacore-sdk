import { describe, expect, it } from 'vitest'
import { scrubToolDump } from './aby-tool-dump'

describe('scrubToolDump', () => {
  it('drops the raw query keys and keeps the records as a list', () => {
    const legacy = [
      '- **Count:** 1',
      '',
      '**Records:**',
      '  - Almacén Uno · ALM001',
      '- **Model:** warehouses',
      '',
      '- **Count:** 0',
      '- **Model:** products',
      '',
      '✅ Plan aplicado (2 cambios).',
    ].join('\n')
    const out = scrubToolDump(legacy)
    expect(out).not.toMatch(/Count|Model|Records|warehouses/)
    expect(out).toContain('- Almacén Uno · ALM001')
    expect(out).toContain('✅ Plan aplicado (2 cambios).')
  })

  it('works on the flattened sidebar preview', () => {
    expect(scrubToolDump('**Count:** 1 **Records:** - Almacén Uno')).toBe('')
  })

  it('leaves prose untouched', () => {
    const text = 'Encontré **1** registro en **Almacenes**: Almacén Uno.'
    expect(scrubToolDump(text)).toBe(text)
  })
})
