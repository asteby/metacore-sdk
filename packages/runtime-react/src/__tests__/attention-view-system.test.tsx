import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyNavBadges, parseNavCounts } from '../attention'
import {
    ConfigurableCard,
    parseViewState,
    removeSavedView,
    resolveCard,
    resolveViewMode,
    serializeViewState,
    upsertSavedView,
    viewStateToParams,
    ViewSwitcher,
} from '../view-system'

describe('parseNavCounts', () => {
    it('drops zero/invalid rows and defaults unknown tone to info', () => {
        const m = parseNavCounts([
            { id: 'a', count: 3, tone: 'urgent', href: '/m/a' },
            { id: 'b', count: 0, tone: 'info' },
            { id: 'c', count: 2, tone: 'weird' },
            null,
        ])
        expect([...m.keys()]).toEqual(['a', 'c'])
        expect(m.get('c')!.tone).toBe('info')
    })
})

describe('applyNavBadges', () => {
    const badges = new Map([
        ['x', { id: 'x', count: 5, tone: 'attention' as const }],
        ['y', { id: 'y', count: 2, tone: 'critical' as const }],
    ])
    it('sums folders deduplicating by id and takes max tone', () => {
        const groups = [
            {
                title: 'g',
                items: [
                    {
                        title: 'f',
                        url: '/f',
                        items: [
                            { title: 'l1', url: '/1', badgeId: 'x' },
                            { title: 'l2', url: '/2', badgeId: 'x' },
                            { title: 'l3', url: '/3', badgeId: 'y' },
                        ],
                    },
                ],
            },
        ]
        const out = applyNavBadges(groups as any, badges)
        const folder = out[0].items[0] as any
        expect(folder.badge).toEqual({ count: 7, tone: 'critical' })
        expect(folder.items[0].badge.count).toBe(5)
        expect((groups[0].items[0] as any).badge).toBeUndefined()
    })
})

describe('view state', () => {
    it('roundtrips through the URL keeping unrelated params', () => {
        const s = parseViewState('?view=cards&search=agua&q=review&f_status=EQ%3Aopen&sortBy=priority&order=desc')
        expect(s).toEqual({ search: 'agua', quick: 'review', filters: { status: 'EQ:open' }, sort: { field: 'priority', dir: 'desc' } })
        const back = serializeViewState({ ...s, search: '' }, '?view=cards&page=2')
        expect(back).toContain('view=cards')
        expect(back).toContain('page=2')
        expect(back).not.toContain('search')
        expect(back).toContain('f_status=EQ%3Aopen')
    })
    it('same params for every mode; explicit filter beats quick', () => {
        const p = viewStateToParams(
            { search: 'x', quick: 'r', filters: { status: 'EQ:b' } },
            [{ key: 'r', label: 'Por revisar', params: { status: 'EQ:a', severity: 'EQ:high' } }],
        )
        expect(p).toEqual({ f_status: 'EQ:b', f_severity: 'EQ:high', search: 'x' })
    })
})

describe('view mode', () => {
    const modes = [{ key: 'cards' }, { key: 'table' }, { key: 'map' }]
    it('precedence url > scoped > model > default; list->table', () => {
        expect(resolveViewMode(modes, { urlView: 'map', scoped: 'table' })).toBe('map')
        expect(resolveViewMode(modes, { urlView: 'list' })).toBe('table')
        expect(resolveViewMode(modes, { scoped: 'table', model: 'map' })).toBe('table')
        expect(resolveViewMode(modes, { urlView: 'nope', model: 'nope', defaultKey: 'table' })).toBe('table')
        expect(resolveViewMode(modes, {})).toBe('cards')
    })
})

describe('ViewSwitcher', () => {
    it('defaults to Tarjetas | Datos, module overrides cards label, hides with one mode', () => {
        const h = renderToStaticMarkup(<ViewSwitcher modes={[{ key: 'cards', label: 'Hallazgos' }, { key: 'table' }]} active='cards' onChange={() => {}} />)
        expect(h).toContain('Hallazgos')
        expect(h).toContain('Datos')
        expect(h).toContain('aria-pressed="true"')
        expect(renderToStaticMarkup(<ViewSwitcher modes={[{ key: 'table' }]} active='table' onChange={() => {}} />)).toBe('')
        expect(renderToStaticMarkup(<ViewSwitcher modes={[{ key: 'cards' }, { key: 'table' }, { key: 'map' }]} active='map' onChange={() => {}} />)).toContain('Mapa')
    })
})

describe('saved views', () => {
    it('upserts by name and removes by id', () => {
        const st = { search: '', quick: '', filters: {} }
        let l = upsertSavedView([], { id: '1', name: 'A', state: st })
        l = upsertSavedView(l, { id: '2', name: 'A', state: { ...st, search: 'z' } })
        expect(l).toHaveLength(1)
        expect(l[0].state.search).toBe('z')
        expect(removeSavedView(l, '2')).toEqual([])
    })
})

describe('manifest-configurable card', () => {
    const spec = {
        title: 'title',
        subtitle: 'summary',
        badge: { field: 'priority', tones: { high: 'urgent' as const }, labels: { high: 'Alta' } },
        chips: ['territory'],
        meta: [{ field: 'seen_at', format: 'date' as const }, { field: 'missing' }],
    }
    const row = { title: 'Fuga', summary: 'Calle 5', priority: 'high', territory: 'Norte', seen_at: '2026-11-01' }
    it('resolves without code per addon and skips missing fields', () => {
        const c = resolveCard(spec, row, 'es')
        expect(c.title).toBe('Fuga')
        expect(c.badge).toEqual({ text: 'Alta', tone: 'urgent' })
        expect(c.chips).toEqual(['Norte'])
        expect(c.meta).toHaveLength(1)
        expect(renderToStaticMarkup(<ConfigurableCard spec={spec} row={row} />)).toContain('Alta')
    })
})
