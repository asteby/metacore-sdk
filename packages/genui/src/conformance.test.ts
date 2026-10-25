import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GENUI_ERROR_CODES } from './errors'
import { downgrade, parseGenUI, upgradeV1 } from './compat'
import { parseUISpec } from './validate'
import { parseUISpecV2, type ParseV2Options } from './validate-v2'

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
      expect(any.ok).toBe(true)
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
      const r = parseGenUI(v.input)
      expect(r.ok).toBe(v.expect.ok)
      if (!r.ok) return expect(r.code).toBe(v.expect.code)
      expect(r.source).toBe('genui/v1')
      expect(r.spec).toEqual(v.expect.output)
      // El v2 resultante es un documento v2 válido (con enlaces externos si el v1 los traía).
      expect(parseUISpecV2(r.spec, { allowExternalLinks: true }).ok).toBe(true)
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
