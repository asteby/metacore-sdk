import { describe, expect, it } from 'vitest'
import { DATALOAD_MESSAGES_EN_US, DATALOAD_MESSAGES_ES_MX, catalogFor, makeT } from './messages'

describe('messages', () => {
  it('ships es-MX and en-US with the same keys and placeholders', () => {
    const es = Object.keys(DATALOAD_MESSAGES_ES_MX).sort()
    expect(Object.keys(DATALOAD_MESSAGES_EN_US).sort()).toEqual(es)
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort()
    for (const k of es) {
      const key = k as keyof typeof DATALOAD_MESSAGES_ES_MX
      expect(vars(DATALOAD_MESSAGES_EN_US[key]), key).toEqual(vars(DATALOAD_MESSAGES_ES_MX[key]))
    }
  })

  it('picks the catalog by locale', () => {
    expect(catalogFor('en-GB')).toBe(DATALOAD_MESSAGES_EN_US)
    expect(catalogFor('es-ES')).toBe(DATALOAD_MESSAGES_ES_MX)
    expect(catalogFor(undefined)).toBe(DATALOAD_MESSAGES_ES_MX)
  })

  it('resolves messages > host t > catalog, and interpolates', () => {
    expect(makeT(undefined, { locale: 'en-US' })('dataload.rows.row', { n: 3 })).toBe('Row 3')
    expect(makeT(undefined, { locale: 'en-US', messages: { 'dataload.rows.row': 'Zeile {{n}}' } })('dataload.rows.row', { n: 3 })).toBe('Zeile 3')
    const host = (key: string, fallback: string) => (key === 'dataload.title' ? 'Importar' : key)
    const t = makeT(host)
    expect(t('dataload.title')).toBe('Importar')
    // A host t that answers with the key (missing translation) falls back to the catalog.
    expect(t('dataload.reset')).toBe('Empezar de nuevo')
  })
})

describe('components', () => {
  it('write no user-facing Spanish literal of their own (all text goes through keys)', async () => {
    // Untyped on purpose: the package does not depend on @types/node.
    const fs: { readdirSync(d: string): string[]; readFileSync(p: string, e: string): string } = await import('node:fs' as string)
    const dir = new URL('.', import.meta.url).pathname
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.') && f !== 'test-utils.tsx')
    const offenders: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(dir + f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      // Quoted strings or JSX text with Spanish letters / punctuation.
      for (const m of src.matchAll(/(['"`])((?:(?!\1).)*[áéíóúñÁÉÍÓÚÑ¿¡](?:(?!\1).)*)\1|>([^<>{}]*[áéíóúñÁÉÍÓÚÑ¿¡][^<>{}]*)</g)) offenders.push(`${f}: ${m[2] ?? m[3]}`)
    }
    expect(files.length).toBeGreaterThan(5)
    expect(offenders).toEqual([])
  })
})
