import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GENUI_ERROR_CODES } from './errors'
import { downgrade, parseGenUI, upgradeV1 } from './compat'
import { parseUISpec } from './validate'
import { parseUISpecV2, type ParseV2Options } from './validate-v2'
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
