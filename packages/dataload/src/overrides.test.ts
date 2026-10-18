import { describe, expect, it } from 'vitest'
import { profile } from './fixtures'
import { blockingIssues, cleanRuleIssue, compactOverrides, parseDefault, resolveProfile, splitList, validateOverrides } from './overrides'

describe('overrides (mirror of the kernel rules)', () => {
  it('accepts valid overrides', () => {
    const o = { ignoreHeaders: ['Meta: _x*'], rename: { name: ['Título'] }, defaults: { status: 'draft' }, cleanAdd: { name: ['upper' as const] }, drop: ['images'] }
    expect(validateOverrides(profile, o, 'o1')).toEqual([])
  })

  it('flags what Profile.Resolve / Validate would reject', () => {
    const issues = validateOverrides(
      profile,
      {
        org: 'otra',
        rename: { nope: ['x'], images: ['y'] },
        drop: ['images', 'sku', 'ghost'],
        cleanAdd: { name: ['bogus' as never, 'drop_lines:(', 'drop_lines:'] },
        clean: ['trim', 'drop_lines:(?i)^aviso'],
        valuesAdd: { missing: { a: 'b' } },
        defaults: { ' ': 1 },
      },
      'o1',
    )
    const codes = issues.map((i) => `${i.code}${'target' in i ? `:${i.target}` : ''}${'rule' in i ? `:${i.rule}` : ''}`)
    expect(codes).toEqual(
      expect.arrayContaining([
        'org_mismatch',
        'unknown_target:nope',
        // Renaming a dropped field is an error in the kernel (checked after drop).
        'unknown_target:images',
        'unknown_target:missing',
        'drop_key:sku',
        'unknown_drop:ghost',
        'bad_rule:bogus',
        'bad_regex:drop_lines:(',
        'bad_regex:drop_lines:',
        'empty_default',
      ]),
    )
    // Go's leading (?i) is accepted.
    expect(cleanRuleIssue('drop_lines:(?i)^aviso', 'clean')).toBeNull()
    // Dropping an unknown field only warns.
    expect(blockingIssues(issues).some((i) => i.code === 'unknown_drop')).toBe(false)
  })

  it('lets an override re-add a key field it drops', () => {
    expect(validateOverrides(profile, { drop: ['sku'], fields: [{ target: 'sku', from: ['Code'] }] })).toEqual([])
  })

  it('resolves like the kernel without mutating the profile', () => {
    const before = JSON.stringify(profile)
    const r = resolveProfile(profile, {
      ignoreHeaders: ['tmp*'],
      rename: { name: ['Título'] },
      drop: ['images'],
      defaults: { status: 'draft' },
      clean: ['collapse_spaces'],
      cleanAdd: { name: ['upper'] },
      valuesAdd: { price: { gratis: '0' } },
      fields: [{ target: 'brand', from: ['Marca'] }],
    })
    expect(JSON.stringify(profile)).toBe(before)
    expect(r.fields.map((f) => f.target)).toEqual(['sku', 'name', 'price', 'brand'])
    expect(r.fields[1]).toMatchObject({ from: ['Nombre', 'Name', 'Título'], clean: ['upper'] })
    expect(r.fields[2]?.values).toEqual({ gratis: '0' })
    expect(r).toMatchObject({ ignoreHeaders: ['tmp*'], defaults: { status: 'draft' }, clean: ['collapse_spaces'] })
  })

  it('compacts empty parts away', () => {
    expect(compactOverrides({ ignoreHeaders: [' ', ''], rename: { name: [] }, defaults: {}, cleanAdd: { name: [] } })).toBeUndefined()
    expect(compactOverrides({ org: 'o1', rename: { name: [' A ', ''] }, drop: ['images'] })).toEqual({ org: 'o1', rename: { name: ['A'] }, drop: ['images'] })
    expect(compactOverrides({ clean: [] })).toEqual({ clean: [] })
  })

  it('parses list and typed defaults', () => {
    expect(splitList(' a, b ,,c ')).toEqual(['a', 'b', 'c'])
    expect(parseDefault('10', { target: 'p', from: [], type: 'number' })).toBe(10)
    expect(parseDefault('true', { target: 'p', from: [], type: 'boolean' })).toBe(true)
    expect(parseDefault('10', { target: 'p', from: [] })).toBe('10')
  })
})
