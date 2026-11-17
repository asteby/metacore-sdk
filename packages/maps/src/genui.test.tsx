// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GenUI, GenUIProvider, getGenUIBlockRenderer } from '@asteby/metacore-genui'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, markers, resetFakes } from './fake-maplibre'
import { registerGenUIMapBlock } from './genui'

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
        expect(screen.getByLabelText('Leyenda por estado').textContent).toContain('late · 1')
        expect(screen.getByLabelText('Leyenda por estado').textContent).toContain('ok · 1')
    })

    it('selecting a point opens the detail panel and navigates through on_select', async () => {
        const onNavigate = vi.fn()
        render(
            <GenUIProvider sources={{ points: rows }} onNavigate={onNavigate}>
                <GenUI spec={spec} />
            </GenUIProvider>,
        )
        await waitFor(() => expect(markers).toHaveLength(2))
        fireEvent.click(screen.getByRole('button', { name: 'Acme, late' }))
        await waitFor(() => expect(screen.getByRole('complementary', { name: 'Acme' }).textContent).toContain('1.2'))
        expect(onNavigate).toHaveBeenCalledWith('/ops/instances')
    })

    it('waits (busy) while the host has not resolved the source', () => {
        render(<GenUI spec={spec} />)
        expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    })
})
