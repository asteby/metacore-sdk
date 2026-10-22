import { describe, expect, it } from 'vitest'
import {
  compatRows, DEFAULT_FITMENT_CONFIG, draftFromVehicle, engineOptions, fitFilterTags, fitState, fitStatus, fitmentConfig, makeOptions,
  modelOptions, parseCatalog, popularVehicles, reconcileDraft, resolveVehicle, rowCoversYear, safeRedirect, splitModelValue,
  vehicleFromDraft, vehicleKey, vehicleLongName, vehicleName, withFit, withoutQueryParam, yearOptions, EMPTY_DRAFT,
} from './fitment.js'

const catalog = parseCatalog({
  makes: [
    { id: 'acme', label: 'Acme', priority: 'HIGH', refs: 9, typical_from: 2010, typical_to: 2014, models: [
      { id: 'roadrunner', label: 'Roadrunner', from: 2005, to: 2020, engines: [{ id: '1-6', label: '1.6 L' }, { id: '2-0', label: '2.0 L', from: 2012 }] },
      ['pick-up', 2000, 2010, ['2-4']],
    ] },
    { id: 'zeta', label: 'Zeta', models: [{ id: 'pick-up', from: 2008, to: 2015, engines: ['3-0-tdi'] }] },
    { id: 'pending', label: 'Pending', models: [] },
    { id: 'broken', label: 'Broken', models: [{ id: 'x', from: 'a' }] },
    { label: 'no id', models: [] },
  ],
})

describe('parseCatalog', () => {
  it('keeps valid makes, compact tuples, derived labels and empty makes; drops invalid ones', () => {
    expect(catalog.makes.map((m) => m.id)).toEqual(['acme', 'zeta', 'pending'])
    const zeta = catalog.makes[1].models[0]
    expect(zeta.label).toBe('PICK UP')
    expect(zeta.engines).toEqual([{ id: '3-0-tdi', label: '3 0 TDI' }])
    expect(catalog.makes[0].models[1]).toMatchObject({ id: 'pick-up', from: 2000, to: 2010 })
  })
  it('parses makes stored as JSON text and tolerates garbage', () => {
    expect(parseCatalog({ makes: JSON.stringify([{ id: 'a', label: 'A', models: [] }]) }).makes).toHaveLength(1)
    expect(parseCatalog({ makes: '{nope' }).makes).toEqual([])
    expect(parseCatalog(null).makes).toEqual([])
  })
  it('normalizes priority, with injectable aliases', () => {
    expect(catalog.makes[0].priority).toBe('high')
    const aliased = parseCatalog({ makes: [{ id: 'a', label: 'A', priority: 'Alta', models: [] }] }, { priorityAliases: { alta: 'high' } })
    expect(aliased.makes[0].priority).toBe('high')
    expect(parseCatalog({ makes: [{ id: 'a', label: 'A', priority: 'alta', models: [] }] }).makes[0].priority).toBeUndefined()
  })
})

describe('resolveVehicle', () => {
  it('resolves a valid key and builds names', () => {
    const v = resolveVehicle(catalog, 'acme/roadrunner/2018/2-0')!
    expect(v.key).toBe('acme/roadrunner/2018/2-0')
    expect(vehicleName(v)).toBe('Acme Roadrunner 2018')
    expect(vehicleLongName(v)).toBe('Acme Roadrunner 2018 · 2.0 L')
  })
  it('rejects unknown, out of range and engine not covering the year', () => {
    expect(resolveVehicle(catalog, null)).toBeNull()
    expect(resolveVehicle(catalog, 'acme/roadrunner/1999/1-6')).toBeNull()
    expect(resolveVehicle(catalog, 'acme/roadrunner/2010/2-0')).toBeNull() // engine starts in 2012
    expect(resolveVehicle(catalog, 'nope/x/2018/1')).toBeNull()
    expect(resolveVehicle(catalog, 'acme/roadrunner/abc/1-6')).toBeNull()
  })
})

describe('cascade', () => {
  it('lists only makes with models', () => {
    expect(makeOptions(catalog).map((o) => o.value)).toEqual(['acme', 'zeta'])
  })
  it('years span the filtered models, newest first', () => {
    expect(yearOptions(catalog, { make: 'zeta', model: '' }).map((o) => o.value)).toEqual(['2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008'])
    expect(yearOptions(catalog, { make: 'nope', model: '' })).toEqual([])
  })
  it('prefixes model values with the make when none is chosen (ids repeat across makes)', () => {
    const all = modelOptions(catalog, { make: '', year: '' })
    expect(all.map((o) => o.value)).toEqual(['acme/roadrunner', 'acme/pick-up', 'zeta/pick-up'])
    expect(modelOptions(catalog, { make: 'acme', year: '2015' }).map((o) => o.value)).toEqual(['roadrunner'])
    expect(splitModelValue('zeta/pick-up')).toEqual({ make: 'zeta', model: 'pick-up' })
    expect(splitModelValue('roadrunner')).toEqual({ model: 'roadrunner' })
  })
  it('filters engines by year', () => {
    expect(engineOptions(catalog, { make: 'acme', year: '2010', model: 'roadrunner' }).map((o) => o.value)).toEqual(['1-6'])
    expect(engineOptions(catalog, { make: 'acme', year: '2015', model: 'roadrunner' }).map((o) => o.value)).toEqual(['1-6', '2-0'])
  })
  it('reconcile drops invalid choices and infers a unique make', () => {
    expect(reconcileDraft(catalog, { make: '', year: '', model: 'roadrunner', engine: '' }).make).toBe('acme')
    expect(reconcileDraft(catalog, { make: '', year: '', model: 'pick-up', engine: '' })).toEqual(EMPTY_DRAFT)
    expect(reconcileDraft(catalog, { make: 'acme', year: '2018', model: 'pick-up', engine: '2-4' })).toMatchObject({ model: '', engine: '' })
  })
  it('round-trips a vehicle through a draft', () => {
    const v = resolveVehicle(catalog, 'acme/roadrunner/2018/1-6')!
    expect(vehicleFromDraft(catalog, draftFromVehicle(v))).toEqual(v)
    expect(vehicleFromDraft(catalog, EMPTY_DRAFT)).toBeNull()
  })
})

describe('popularVehicles', () => {
  it('builds one shortcut per high-priority make from the data', () => {
    expect(popularVehicles(catalog)).toEqual([{ key: 'acme/roadrunner/2012/1-6', label: 'Acme Roadrunner 2012' }])
    expect(popularVehicles(catalog, 0)).toEqual([])
  })
})

describe('fitment', () => {
  const key = 'acme/roadrunner/2018/1-6'
  it('compares only what the backend published', () => {
    expect(fitStatus({ tags: ['x'] }, { key })).toBe('unknown')
    expect(fitStatus({ tags: ['fit:universal'] }, null)).toBe('universal')
    expect(fitStatus({ tags: [`fit:${key}`] }, { key })).toBe('fits')
    expect(fitStatus({ tags: ['fit:other'] }, { key })).toBe('no')
    expect(fitStatus({ tags: ['fit:other'] }, null)).toBe('unknown')
    expect(fitFilterTags({ key })).toEqual([`fit:${key}`, 'fit:universal'])
  })
  it('config is injectable and the universal tag follows a custom prefix', () => {
    const c = fitmentConfig({ tagPrefix: 'ajusta:' })
    expect(c.universalTag).toBe('ajusta:universal')
    expect(fitStatus({ tags: [`ajusta:${key}`, 'fit:zzz'] }, { key }, c)).toBe('fits')
    expect(fitFilterTags({ key }, c)).toEqual([`ajusta:${key}`, 'ajusta:universal'])
    expect(fitmentConfig()).toEqual(DEFAULT_FITMENT_CONFIG)
  })
  it('withFit collapses fit tags into one state tag that fitState reads back', () => {
    const p = withFit({ id: 1, tags: ['a', `fit:${key}`, 'fit:other'] }, { key })
    expect(p.tags).toEqual(['a', 'fit-state:fits'])
    expect(fitState(p)).toBe('fits')
    expect(fitState({ tags: ['a'] })).toBe('unknown')
    expect(withFit({ tags: ['fit:other'] }, { key }).tags).toEqual(['fit-state:no'])
  })
  it('reads the compatibility table and year ranges', () => {
    const rows = compatRows({ attributes: { compatibility: 'Acme|Roadrunner|2012-2019|1.6|front; Zeta|Pick|2016|3.0 ;bad|row' } })
    expect(rows).toEqual([
      { make: 'Acme', model: 'Roadrunner', years: '2012-2019', engine: '1.6', note: 'front' },
      { make: 'Zeta', model: 'Pick', years: '2016', engine: '3.0', note: null },
    ])
    expect(compatRows({ attributes: {} })).toEqual([])
    expect(compatRows({ attributes: { compatibilidad: 'A|B|2000|1' } }, fitmentConfig({ compatAttribute: 'compatibilidad' }))).toHaveLength(1)
    expect(rowCoversYear('2012-2019', 2015)).toBe(true)
    expect(rowCoversYear('2016', 2016)).toBe(true)
    expect(rowCoversYear('2016', 2017)).toBe(false)
    expect(rowCoversYear('x', 2017)).toBe(false)
  })
})

describe('helpers', () => {
  it('vehicleKey joins the four parts', () => expect(vehicleKey({ make: 'a', model: 'b', year: 2020, engine: 'c' })).toBe('a/b/2020/c'))
  it('safeRedirect only allows own relative paths', () => {
    expect(safeRedirect('/cart?x=1')).toBe('/cart?x=1')
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil', '', null, undefined]) expect(safeRedirect(bad as string, '/home')).toBe('/home')
  })
  it('withoutQueryParam removes only the given param', () => {
    expect(withoutQueryParam('/c?vehicle=invalid&page=2', 'vehicle')).toBe('/c?page=2')
    expect(withoutQueryParam('/c?vehicle=invalid', 'vehicle')).toBe('/c')
  })
})
