import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GENUI_ERROR_CODES } from './errors'
import { downgrade, parseGenUI, upgradeV1 } from './compat'
import { parseUISpec } from './validate'
import { compareUtf8, parseUISpecV2, type ParseV2Options } from './validate-v2'
import { GENUI_V2_SCHEMA } from './generated/genui-v2-schema'
// @ts-expect-error módulo .mjs sin tipos
import { findUnsupported } from '../scripts/schema-keywords.mjs'

// Vectores compartidos con el kernel Go (conformance/README.md).
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'conformance')

interface Vector {
  description: string
  input: unknown
  options?: ParseV2Options
  expect: { ok: boolean; code?: string; output?: unknown }
}

function load(kind: string): [string, Vector][] {
  return readdirSync(join(dir, kind))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, kind, f), 'utf8')) as Vector])
}

describe('genui conformance: valid', () => {
  for (const [name, v] of load('valid')) {
    it(`${name}: ${v.description}`, () => {
      const r = parseUISpecV2(v.input, v.options)
      expect(r.ok, r.ok ? '' : `${r.code} ${r.error}`).toBe(true)
      const any = parseGenUI(v.input, v.options)
      expect(any.ok, any.ok ? '' : `${any.code} ${any.error}`).toBe(true)
    })
  }
})

describe('genui conformance: invalid', () => {
  for (const [name, v] of load('invalid')) {
    it(`${name}: ${v.description}`, () => {
      expect(GENUI_ERROR_CODES).toContain(v.expect.code)
      const r = parseUISpecV2(v.input, v.options)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code, r.error).toBe(v.expect.code)
      expect(parseGenUI(v.input, v.options).ok).toBe(false)
    })
  }
})

describe('genui conformance: upgrade', () => {
  for (const [name, v] of load('upgrade')) {
    it(`${name}: ${v.description}`, () => {
      const r = parseGenUI(v.input, v.options)
      expect(r.ok, r.ok ? '' : `${r.code} ${r.error}`).toBe(v.expect.ok)
      if (!r.ok) return expect(r.code).toBe(v.expect.code)
      expect(r.source).toBe('genui/v1')
      expect(r.spec).toEqual(v.expect.output)
      // El v2 resultante es un documento v2 válido con las mismas opciones.
      expect(parseUISpecV2(r.spec, v.options).ok).toBe(true)
      const v1 = parseUISpec(v.input)
      if (v1.ok) expect(upgradeV1(v1.spec)).toEqual(v.expect.output)
    })
  }
})

describe('genui conformance: downgrade', () => {
  for (const [name, v] of load('downgrade')) {
    it(`${name}: ${v.description}`, () => {
      const { spec, caps } = v.input as { spec: never; caps?: never }
      const r = downgrade(spec, caps)
      expect(r.ok).toBe(v.expect.ok)
      if (!r.ok) return expect(r.code).toBe(v.expect.code)
      expect(r.spec).toEqual(v.expect.output)
    })
  }
})

// ---- invariantes del conjunto de vectores ----
const reverseKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v

describe('genui conformance: invariantes', () => {
  it('el código de error no depende del orden de las claves del objeto', () => {
    for (const [name, v] of load('invalid')) {
      if (typeof v.input === 'string') continue
      const a = parseUISpecV2(v.input, v.options)
      const b = parseUISpecV2(reverseKeys(v.input), v.options)
      expect(a.ok || b.ok, name).toBe(false)
      if (!a.ok && !b.ok) expect(b.code, name).toBe(a.code)
    }
  })

  it('cada código de error del contrato tiene al menos un vector invalid', () => {
    const covered = new Set(load('invalid').map(([, v]) => v.expect.code))
    for (const [, v] of [...load('upgrade'), ...load('downgrade')]) if (v.expect.code) covered.add(v.expect.code)
    expect(GENUI_ERROR_CODES.filter((c) => !covered.has(c))).toEqual([])
  })

  it('el esquema solo usa keywords que el intérprete entiende (falla cerrado)', () => {
    expect(findUnsupported(GENUI_V2_SCHEMA)).toEqual([])
    expect(findUnsupported({ allOf: [], properties: { a: { not: {}, minLength: 1 } } }).map(([, k]: [string, string]) => k)).toEqual(['allOf', 'not', 'minLength'])
  })
})

describe('genui: claves de prototipo', () => {
  it('upgradeV1 y downgrade nunca asignan __proto__ ni contaminan Object.prototype', () => {
    const evil = JSON.parse('{"version":"genui/v1","blocks":[{"type":"text","text":"x","__proto__":{"polluted":true}}]}')
    const up = upgradeV1(evil) as unknown as Record<string, unknown>
    expect(Object.getPrototypeOf(up)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(JSON.stringify(up)).not.toContain('polluted')
    const r = parseGenUI(evil)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('genui.forbidden_key')
  })
})

describe('genui: endurecimiento del validador', () => {
  it('un objeto con getter o prototipo ajeno se valida y se devuelve como COPIA', () => {
    let m = 0
    const g = { version: 'genui/v2', blocks: [{ type: 'card', title: 'x', get link() { return m++ < 3 ? '/ok' : 'javascript:alert(1)' } }] }
    const r2 = parseUISpecV2(g)
    expect(r2.ok, r2.ok ? '' : r2.error).toBe(true)
    if (r2.ok) {
      expect(r2.spec).not.toBe(g)
      expect(JSON.stringify(r2.spec)).not.toContain('javascript:')
      expect((r2.spec.blocks[0] as { link?: string }).link).toBe('/ok')
    }
    const inherited = { version: 'genui/v2', blocks: [Object.assign(Object.create({ link: 'javascript:alert(1)' }), { type: 'card', title: 'x' })] }
    const r3 = parseUISpecV2(inherited)
    expect(r3.ok).toBe(true)
    if (r3.ok) {
      expect(JSON.stringify(r3.spec)).not.toContain('javascript:')
      expect((r3.spec.blocks[0] as { link?: string }).link).toBeUndefined()
    }
    const doc = { version: 'genui/v2', blocks: [{ type: 'text', text: 'x' }] }
    const r4 = parseUISpecV2(doc)
    expect(r4.ok && r4.spec !== (doc as unknown)).toBe(true)
  })

  it('los límites por clave no heredan de Object.prototype (el código es siempre una cadena)', () => {
    const big = (n: number) => Array.from({ length: n }, (_, i) => i)
    const a = parseUISpecV2({ version: 'genui/v2', state: { toString: big(51) }, blocks: [{ type: 'text', text: 'x' }] })
    const props = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 1]))
    const b = parseUISpecV2({ version: 'genui/v2', state: { valueOf: props }, blocks: [{ type: 'text', text: 'x' }] })
    for (const r of [a, b]) {
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(typeof r.code).toBe('string')
        expect(GENUI_ERROR_CODES).toContain(r.code)
      }
    }
  })

  it('la copia validada no conserva claves de prototipo que añada toJSON', () => {
    const r = parseUISpecV2({ version: 'genui/v2', blocks: [{ type: 'text', text: 'x' }], toJSON: () => JSON.parse('{"version":"genui/v2","blocks":[],"__proto__":{"x":1}}') })
    expect(r.ok).toBe(false)
  })

  it('compareUtf8 ordena por bytes UTF-8, no por unidades UTF-16', () => {
    expect(['\u{10000}', ''].sort(compareUtf8)).toEqual(['', '\u{10000}'])
    expect(['b', 'a', 'ab'].sort(compareUtf8)).toEqual(['a', 'ab', 'b'])
    expect(compareUtf8('a', 'a')).toBe(0)
  })

  it('findUnsupported falla cerrado con los huecos de la lista blanca', () => {
    const kinds = (s: unknown) => (findUnsupported(s) as [string, string][]).map(([, k]) => k)
    expect(kinds({ items: [{ type: 'string' }] })).toEqual(['items(no-objeto)'])
    expect(kinds({ items: { type: 'string' } })).toEqual([])
    expect(kinds({ propertyNames: { pattern: '^a$', maxLength: 3, enum: ['a'] } })).toEqual(['propertyNames.maxLength', 'propertyNames.enum'])
    expect(kinds({ propertyNames: { pattern: '^a$' } })).toEqual([])
    expect(kinds({ $ref: '#/$defs/a', maxLength: 3, description: 'ok' })).toEqual(['$ref+maxLength'])
    expect(kinds({ $ref: '#/$defs/a', description: 'ok', title: 't', default: 1 })).toEqual([])
  })
})
