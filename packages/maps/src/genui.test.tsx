// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GenUI, GenUIProvider, getGenUIBlockRenderer } from '@asteby/metacore-genui'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, popups, resetFakes } from './fake-maplibre'
import { GenUIMapBlock, registerGenUIMapBlock } from './genui'

let undo: () => void
beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
    undo = registerGenUIMapBlock()
})
afterEach(() => {
    cleanup()
    undo()
})

const spec = {
    version: 'genui/v2',
    data: { points: { q: 't:hub.Instance?limit=200' } },
    blocks: [
        {
            type: 'map',
            summary: 'Instancias',
            source: 'data.points',
            fields: { key: 'id', label: 'name', group: 'vertical' },
            status_tones: { late: 'danger', ok: 'success' },
            legend: true,
            detail_panel: true,
            on_select: { do: 'navigate', route: { path: '/ops/instances' } },
        },
    ],
}
const rows = [
    { id: 'a', name: 'Acme', lat: 19.4, lng: -99.1, status: 'late', version: '1.2' },
    { id: 'b', name: 'Beta', lat: 20.6, lng: -103.3, status: 'ok' },
]

describe('genui map block', () => {
    it('registers itself as the `map` renderer and restores the previous one', () => {
        expect(getGenUIBlockRenderer('map')).toBeTruthy()
        undo()
        expect(getGenUIBlockRenderer('map')).toBeUndefined()
        undo = registerGenUIMapBlock()
    })

    it('draws points from the host source with a legend that prints status and count', async () => {
        render(
            <GenUIProvider sources={{ points: rows }}>
                <GenUI spec={spec} />
            </GenUIProvider>,
        )
        await waitFor(() => expect(markers).toHaveLength(2))
        expect(screen.getByLabelText('Leyenda por estado').textContent).toContain('Late · 1')
        expect(screen.getByLabelText('Leyenda por estado').textContent).toContain('Ok · 1')
    })

    it('selecting a point opens the detail panel and navigates through on_select', async () => {
        const onNavigate = vi.fn()
        render(
            <GenUIProvider sources={{ points: rows }} onNavigate={onNavigate}>
                <GenUI spec={spec} />
            </GenUIProvider>,
        )
        await waitFor(() => expect(markers).toHaveLength(2))
        fireEvent.click(screen.getByRole('button', { name: 'Acme, Late' }))
        await waitFor(() => expect(screen.getByRole('complementary', { name: 'Acme' }).textContent).toContain('1.2'))
        expect(onNavigate).toHaveBeenCalledWith('/ops/instances')
    })

    it('passes precision and area to the map (bubble "GT · 2") and shows the popup columns of the selected point', async () => {
        const approx = [
            { id: 'a', name: 'Acme', lat: 14.6, lng: -90.5, status: 'ok', prec: 'country', iso: 'GT', plan: 'pro', secret: 'x' },
            { id: 'b', name: 'Beta', lat: 14.6, lng: -90.5, status: 'ok', prec: 'country', iso: 'GT', plan: 'free', secret: 'y' },
        ]
        const s2 = { ...spec, blocks: [{ ...spec.blocks[0], precision_field: 'prec', area_field: 'iso', popup: ['plan'] }] }
        render(
            <GenUIProvider sources={{ points: approx }}>
                <GenUI spec={s2} />
            </GenUIProvider>,
        )
        await waitFor(() => expect(instances[0]?.layers.has('mcm-points-areas')).toBe(true))
        const props = instances[0]!.sources.get('mcm-points-areas').data.features[0].properties
        expect(JSON.stringify(props)).toContain('GT')
        expect(JSON.stringify(props)).toContain('2')
    })

    it('waits (busy) while the host has not resolved the source', () => {
        render(<GenUI spec={spec} />)
        expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    })

    describe('country precision: one bubble per area, a list panel, labelled and translated', () => {
        const fleet = [
            { id: 'a', name: 'La Colonia', host: 'lc.example.com', lat: 14.6, lng: -90.5, presence: 'live_24h', iso: 'GT', ops_version: '1.2' },
            { id: 'b', name: 'Siete Leguas', host: 'sl.example.com', lat: 14.6, lng: -90.5, presence: 'live_24h', iso: 'GT', ops_version: '1.3' },
            { id: 'c', name: 'Asteby', host: 'as.example.com', lat: 14.6, lng: -90.5, presence: 'stale_7d', iso: 'GT', ops_version: '1.3' },
        ]
        // Schema-valid convention: the host translates `map.field.<column>` / `map.status.<value>`.
        const dict: Record<string, string> = { 'fleet.ops': 'Versión de Ops', 'fleet.live': 'En línea', 'map.field.ops_version': 'Versión de Ops', 'map.status.live_24h': 'En línea', 'map.status.stale_7d': 'Sin señal (7 d)' }
        const t = (k: string) => dict[k] ?? k
        const country = {
            version: 'genui/v2',
            data: { fleet: { q: 't:hub.Instance' } },
            blocks: [
                {
                    type: 'map',
                    summary: 'Flota',
                    source: 'data.fleet',
                    fields: { key: 'id', label: 'name', status: 'presence' },
                    precision: 'country',
                    area_field: 'iso',
                    subtitle_field: 'host',
                    popup: ['name', 'host', 'ops_version', 'iso', 'presence'],
                    status_tones: { live_24h: 'success', stale_7d: 'warning' },
                    cluster: true,
                    detail_panel: true,
                    legend: true,
                },
            ],
        }
        const withLabels = country
        const mount = async (spec: unknown) => {
            render(
                <GenUIProvider sources={{ fleet }} t={t as never}>
                    <GenUI spec={spec as never} />
                </GenUIProvider>,
            )
            await waitFor(() => expect(instances[0]?.layers.has('mcm-points-areas')).toBe(true))
            const map = instances[0]!
            const f = map.sources.get('mcm-points-areas').data.features[0]
            return { map, feature: { properties: f.properties, geometry: { coordinates: [-90.5, 14.6] } } }
        }

        it('an area click opens the member list in the panel: no fan, no popup, translated badges', async () => {
            const { map, feature } = await mount(withLabels)
            const popupsBefore = popups.length
            map.emit('click', { features: [feature] }, 'mcm-points-areas')
            const panel = await screen.findByTestId('map-area-panel')
            expect(markers.some((m) => m.el.classList.contains('mcm-spider'))).toBe(false)
            expect(popups.length).toBe(popupsBefore)
            const rows = within(panel).getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.includes(','))
            expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['La Colonia, En línea', 'Siete Leguas, En línea', 'Asteby, Sin señal (7 d)'])
            expect(panel.textContent).toContain('lc.example.com')
            expect(panel.textContent).not.toContain('live_24h')
            expect(within(panel).getByRole('list').getAttribute('aria-label')).toBeTruthy()
        })

        it('keyboard: arrows walk the members, Enter opens the sheet with labelled rows, back returns to the list', async () => {
            const { map, feature } = await mount(withLabels)
            map.emit('click', { features: [feature] }, 'mcm-points-areas')
            const panel = await screen.findByTestId('map-area-panel')
            const rows = within(panel).getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement)
            await waitFor(() => expect(document.activeElement).toBe(rows[0]))
            fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
            expect(document.activeElement).toBe(rows[1])
            fireEvent.keyDown(rows[1]!, { key: 'End' })
            expect(document.activeElement).toBe(rows[2])
            fireEvent.click(rows[1]!)
            const detail = await screen.findByTestId('map-detail-panel')
            // Labels: explicit $t, then a readable fallback; never the raw column key. Title / host / status are not repeated as rows.
            const dts = [...detail.querySelectorAll('dt')].map((d) => d.textContent)
            expect(dts).toEqual(['Versión de Ops', 'Iso'])
            expect(detail.textContent).toContain('En línea')
            expect(detail.textContent).not.toMatch(/ops_version|presence|live_24h/)
            expect(within(detail).getAllByText('Siete Leguas')).toHaveLength(1)
            fireEvent.click(within(detail).getByRole('button', { name: 'Volver a la lista' }))
            expect(await screen.findByTestId('map-area-panel')).toBeTruthy()
        })

        it('explicit field_labels / status_labels (not yet in the schema) win over the convention and the fallback', () => {
            const text = (v: unknown) => (typeof v === 'string' ? v : t((v as { $t: string }).$t))
            const block = { ...country.blocks[0], field_labels: { ops_version: { $t: 'fleet.ops' }, iso: 'País' }, status_labels: { live_24h: { $t: 'fleet.live' }, stale_7d: 'Inactiva' } }
            render(<GenUIMapBlock block={block as never} rows={fleet} text={text} navigate={() => undefined} act={() => undefined} />)
            expect(screen.getByLabelText('Leyenda por estado').textContent).toBe('En línea · 2Inactiva · 1')
        })

        it('a status with no translation reads as words, not as a raw key', async () => {
            render(
                <GenUIProvider sources={{ fleet }} t={((k: string) => k) as never}>
                    <GenUI spec={country as never} />
                </GenUIProvider>,
            )
            await waitFor(() => expect(screen.getByLabelText('Leyenda por estado').textContent).toBe('Live 24h · 2Stale 7d · 1'))
        })

        it('the legend is translated', async () => {
            await mount(country)
            const legend = screen.getByLabelText('Leyenda por estado').textContent
            expect(legend).toContain('En línea · 2')
            expect(legend).toContain('Sin señal (7 d) · 1')
        })

        it('without detail_panel the area opens a scrollable popup list and the popup keeps its rows', async () => {
            const { map, feature } = await mount({ ...country, blocks: [{ ...country.blocks[0], detail_panel: false }] })
            map.emit('click', { features: [feature] }, 'mcm-points-areas')
            expect(screen.queryByTestId('map-area-panel')).toBeNull()
            expect(markers.some((m) => m.el.classList.contains('mcm-spider'))).toBe(false)
            expect(popups.at(-1)!.node!.querySelectorAll('.mcm-list button')).toHaveLength(3)
        })
    })
})
