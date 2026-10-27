import { describe, expect, it } from 'vitest'
import { MOCK_SUBJECT_KINDS } from './mock/subjects.js'
import { coversYear, fitTag, fitTagsAny, isMasked, reconcileSubjectValues, resolveSubject, subjectLevels, splitSubjectTree, subjectOptions } from './subjects.js'
import { productListQuery } from './query.js'

const garage = MOCK_SUBJECT_KINDS[0]!
const size = MOCK_SUBJECT_KINDS[1]!
const NP300 = { make: 'nissan', model: 'np300', year: 2012, engine: '2.5' }

describe('subject cascade (data-driven, no kind named)', () => {
  it('levels are the catalog fields that are not years', () => {
    expect(subjectLevels(garage).map((f) => f.key)).toEqual(['make', 'model', 'engine'])
    expect(subjectLevels(size)).toEqual([])
  })

  it('a level shows nothing until the previous one is chosen, then its options by label', () => {
    expect(subjectOptions(garage, 'make', {}).map((o) => o.label)).toEqual(['Ford', 'Nissan'])
    expect(subjectOptions(garage, 'model', {})).toEqual([])
    expect(subjectOptions(garage, 'model', { make: 'nissan' })).toEqual([
      { value: 'np300', label: 'NP300 Frontier' },
      { value: 'versa', label: 'Versa' },
    ])
    expect(subjectOptions(garage, 'engine', { make: 'nissan' })).toEqual([])
    expect(subjectOptions(garage, 'engine', { make: 'nissan', model: 'np300' }).map((o) => o.value)).toEqual(['2.4', '2.5'])
  })

  it('years are the model years the chosen options cover, newest first; an engine narrows by the chosen year', () => {
    expect(subjectOptions(garage, 'year', {})).toEqual([])
    const years = subjectOptions(garage, 'year', { make: 'nissan', model: 'np300' }).map((o) => Number(o.value))
    expect(years[0]).toBe(2022)
    expect(years.at(-1)).toBe(2008)
    expect(subjectOptions(garage, 'engine', { make: 'nissan', model: 'np300', year: 2018 }).map((o) => o.value)).toEqual(['2.4']) // 2.5 L is 2010-2015
    expect(subjectOptions(garage, 'engine', { make: 'nissan', model: 'np300', year: '2012' }).map((o) => o.value)).toEqual(['2.4', '2.5'])
    // an engine chosen AFTER the year does not constrain it (it is reconciled against the year instead)
    expect(subjectOptions(garage, 'year', { make: 'nissan', model: 'np300', engine: '2.5' })).toEqual(subjectOptions(garage, 'year', { make: 'nissan', model: 'np300' }))
  })

  it('a free kind has no options; unknown fields have none', () => {
    expect(subjectOptions(size, 'garment', {})).toEqual([])
    expect(subjectOptions(garage, 'nope', {})).toEqual([])
    expect(subjectOptions(garage, 'plate', {})).toEqual([])
  })

  it('reconcile drops what a change made invalid, in field order, and never touches free values', () => {
    expect(reconcileSubjectValues(garage, { ...NP300, make: 'ford' })).toMatchObject({ make: 'ford', model: '', year: 2012, engine: '' }) // no option on the path declares years yet: the year stays
    expect(reconcileSubjectValues(garage, { ...NP300, make: 'ford', model: 'f150', year: 2012, engine: '5.0' })).toMatchObject({ model: 'f150', year: 2012, engine: '5.0' })
    // a year the model does not cover clears the model (the year narrows the levels, as in a parts finder)
    expect(reconcileSubjectValues(garage, { make: 'ford', model: 'f150', year: 1990 })).toMatchObject({ make: 'ford', model: '', year: 1990 })
    expect(reconcileSubjectValues(garage, { ...NP300, year: 2018 })).toMatchObject({ model: 'np300', year: 2018, engine: '' })
    expect(reconcileSubjectValues(garage, { ...NP300, plate: 'ABC-1' })).toMatchObject({ ...NP300, plate: 'ABC-1' })
    expect(reconcileSubjectValues(size, { garment: 'x', value: 'y' })).toEqual({ garment: 'x', value: 'y' })
  })
})

describe('resolveSubject mirrors the server', () => {
  it('builds the label and the key from public values only', () => {
    const r = resolveSubject(garage, { ...NP300, plate: 'ZXQ-9917' })
    expect(r).toMatchObject({ ok: true, subject: { label: 'Nissan NP300 Frontier 2012 2.5 L', fit_key: 'nissan/np300/2012/2.5' } })
    if (!r.ok) throw new Error('unreachable')
    expect(JSON.stringify([r.subject.label, r.subject.fit_key, r.subject.attributes])).not.toContain('ZXQ')
    expect(r.subject.private).toEqual({ plate: 'ZXQ-9917' })
    expect(r.subject.attributes).toEqual({ make: 'nissan', model: 'np300', year: 2012, engine: '2.5' })
  })

  it('refuses by field, never naming the value', () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ ...NP300, make: 'SECRET-123' }, 'make', 'not_in_catalog'],
      [{ ...NP300, model: 'f150' }, 'model', 'not_in_catalog'],
      [{ ...NP300, year: 2007 }, 'year', 'year_range'],
      [{ ...NP300, year: 'x' }, 'year', 'invalid'],
      [{ ...NP300, year: 2018 }, 'year', 'year_range'], // 2.5 L is 2010-2015
      [{ make: 'nissan' }, 'model', 'required'],
      [{ ...NP300, color: 'red' }, 'color', 'unknown'],
      [{ ...NP300, plate: 'A'.repeat(13) }, 'plate', 'invalid'],
      [{ ...NP300, make: 5 }, 'make', 'invalid'],
    ]
    for (const [values, field, code] of cases) {
      const r = resolveSubject(garage, values as never)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.problems[field]).toBe(code)
        expect(JSON.stringify(r.problems)).not.toContain('SECRET')
      }
    }
  })

  it('no engine: the item resolves but has no key (it never matches a product)', () => {
    expect(resolveSubject(garage, { make: 'nissan', model: 'versa', year: 2018 })).toMatchObject({ ok: true, subject: { label: 'Nissan Versa 2018', fit_key: '' } })
  })

  it('ids are case-insensitive on input, keys are lowercase', () => {
    expect(resolveSubject(garage, { make: 'NISSAN', model: 'Versa', year: '2018', engine: '1.6' })).toMatchObject({ ok: true, subject: { fit_key: 'nissan/versa/2018/1.6' } })
  })

  it('a kind without catalog works from free values (any kind, no vehicle)', () => {
    expect(resolveSubject(size, { garment: 'Camisa  de lino', value: 'M' })).toMatchObject({ ok: true, subject: { label: 'Camisa de lino M', fit_key: 'camisa-de-lino/m' } })
    expect(resolveSubject(size, { garment: 'x' })).toMatchObject({ ok: false, problems: { value: 'required' } })
  })

  it('a catalog field of a kind published without its catalog cannot be validated', () => {
    expect(resolveSubject({ ...garage, catalog: null }, NP300)).toMatchObject({ ok: false, problems: { make: 'catalog_unavailable' } })
  })
})

describe('fit tags', () => {
  it('asks for the own tag plus the universal one, nothing without a key', () => {
    expect(fitTagsAny('nissan/np300/2012/2.5')).toEqual(['fit:nissan/np300/2012/2.5', 'fit:universal'])
    expect(fitTagsAny('a/b', { prefix: 'ajuste:', universal: false })).toEqual(['ajuste:a/b'])
    expect(fitTagsAny('')).toEqual([])
    expect(fitTagsAny(null)).toEqual([])
    expect(fitTag('x')).toBe('fit:x')
  })

  it('tags_any travels comma-separated and refuses what the API would split or reject', () => {
    expect(productListQuery({ tags_any: ['fit:a/b', 'fit:universal'], q: 'filtro' }).toString()).toBe('q=filtro&tags_any=fit%3Aa%2Fb%2Cfit%3Auniversal')
    expect(productListQuery({ tags_any: [] }).has('tags_any')).toBe(false)
    expect(() => productListQuery({ tags_any: ['a,b'] })).toThrow(TypeError)
    expect(() => productListQuery({ tags_any: ['a', 'b', 'c', 'd', 'e', 'f'] })).toThrow(RangeError)
    expect(() => productListQuery({ tags_any: ['x'.repeat(121)] })).toThrow(TypeError)
  })

  it('knows the server mask', () => {
    expect(isMasked('••17')).toBe(true)
    expect(isMasked('ZXQ-9917')).toBe(false)
    expect(isMasked(undefined)).toBe(false)
  })

  it('year coverage: ranges win, then from/to, an open option covers any year', () => {
    expect(coversYear({ ranges: [[2010, 2015]], from: 2000, to: 2030 }, 2020)).toBe(false)
    expect(coversYear({ from: 2010, to: 2015 }, 2016)).toBe(false)
    expect(coversYear({ from: 2010 }, 2099)).toBe(true)
    expect(coversYear({}, 1999)).toBe(true)
  })
})

describe('splitSubjectTree (a catalog over several pages)', () => {
  const tree = Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`make-${i}`, { label: `Make ${i} «ñ»`, children: { m: { label: 'M', from: 2000, to: 2020 } } }]),
  )
  it('keeps every first-level option once, in order, each part within the budget as escaped text', () => {
    const parts = splitSubjectTree(tree, 1024)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.flatMap((p) => Object.keys(p))).toEqual(Object.keys(tree))
    for (const p of parts) expect(new TextEncoder().encode(JSON.stringify(JSON.stringify(p))).length).toBeLessThanOrEqual(1024)
  })
  it('a small tree is one part; an option larger than a page on its own is refused', () => {
    expect(splitSubjectTree(tree)).toHaveLength(1)
    expect(() => splitSubjectTree(tree, 40)).toThrow(RangeError)
  })
})
