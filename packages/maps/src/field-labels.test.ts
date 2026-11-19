import { describe, expect, it } from 'vitest'
import { humanize, makeTerms, regionName, translateKey, type TextFn } from './field-labels'

// A host `t` like i18next: unknown keys come back as the key itself.
const dict: Record<string, string> = { 'map.field.host': 'Servidor', 'map.status.live_24h': 'En línea (24 h)', 'x.name': 'Nombre', 'x.live': 'Activa' }
const text: TextFn = (v) => {
    if (typeof v === 'string') return v
    const k = (v as { $t?: string })?.$t
    return k ? (dict[k] ?? k) : ''
}

describe('humanize', () => {
    it('turns identifiers into readable words and leaves prose alone', () => {
        expect(humanize('ops_version')).toBe('Ops version')
        expect(humanize('live_24h')).toBe('Live 24h')
        expect(humanize('lastSeenAt')).toBe('Last seen at')
        expect(humanize('country_iso')).toBe('Country iso')
        expect(humanize('En línea')).toBe('En línea')
        expect(humanize('OK')).toBe('OK')
        expect(humanize('Acme Corp')).toBe('Acme Corp')
    })
})

describe('translateKey', () => {
    it('is undefined when the host answers with the key (or its tail)', () => {
        expect(translateKey(text, 'map.field.host')).toBe('Servidor')
        expect(translateKey(text, 'map.field.nope')).toBeUndefined()
        expect(translateKey((v) => (typeof v === 'object' ? 'nope' : ''), 'map.field.nope')).toBeUndefined()
    })
})

describe('makeTerms', () => {
    it('explicit label map first, then the host convention, then a readable fallback (never the raw key)', () => {
        const t = makeTerms({ field_labels: { name: { $t: 'x.name' }, version: 'Versión' }, status_labels: { live: { $t: 'x.live' } } }, text)
        expect(t.field('name')).toBe('Nombre')
        expect(t.field('version')).toBe('Versión')
        expect(t.field('host')).toBe('Servidor')
        expect(t.field('ops_version')).toBe('Ops version')
        expect(t.status('live')).toBe('Activa')
        expect(t.status('live_24h')).toBe('En línea (24 h)')
        expect(t.status('stale_7d')).toBe('Stale 7d')
    })

    it('ignores inherited keys of the label maps', () => {
        expect(makeTerms({ field_labels: {} }, text).field('constructor')).toBe('Constructor')
    })
})

describe('regionName', () => {
    it('names an ISO country in the locale, else keeps the code', () => {
        expect(regionName('GT', 'es')).toMatch(/Guatemala/)
        expect(regionName('ZZ-1', 'es')).toBe('ZZ-1')
        expect(regionName('Centro', 'es')).toBe('Centro')
    })
})
