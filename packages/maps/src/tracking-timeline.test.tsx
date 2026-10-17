// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { sortTrackingEvents, toTrackingEvents, TrackingTimeline, type TrackingEvent } from './tracking-timeline'

afterEach(cleanup)

const events: TrackingEvent[] = [
    { id: '1', status: 'Recolectado', at: '2026-10-16T10:00:00Z', location: 'CDMX' },
    { id: '3', status: 'Entregado', at: '2026-10-18T09:00:00Z', location: { label: 'Guadalajara', lat: 20.67, lng: -103.35 } },
    { id: '2', status: 'En tránsito', at: '2026-10-17T09:00:00Z', description: 'Salió de centro de distribución' },
    { id: '4', status: 'Sin fecha', at: null },
]

describe('<TrackingTimeline>', () => {
    it('lists newest first, undated events last, and marks the current step', () => {
        render(<TrackingTimeline events={events} timeZone="UTC" />)
        const items = screen.getAllByRole('listitem')
        expect(items.map((li) => li.querySelector('div > span')?.textContent)).toEqual(['Entregado', 'En tránsito', 'Recolectado', 'Sin fecha'])
        expect(items[0]?.getAttribute('aria-current')).toBe('step')
        expect(items[1]?.getAttribute('aria-current')).toBeNull()
    })

    it('states the state in words (not colour alone) and formats times with <time>', () => {
        render(<TrackingTimeline events={events} timeZone="UTC" locale="es-MX" />)
        expect(screen.getByText(/Estado actual/)).toBeTruthy()
        expect(screen.getAllByText(/Completado/).length).toBe(3)
        const t = document.querySelector('time')!
        expect(t.getAttribute('datetime')).toBe('2026-10-18T09:00:00.000Z')
        expect(t.textContent).toMatch(/2026/)
    })

    it('links located events to a map without scripts', () => {
        render(<TrackingTimeline events={events} />)
        const a = screen.getByRole('link', { name: 'Ver en mapa' })
        expect(a.getAttribute('href')).toContain('mlat=20.67&mlon=-103.35')
        expect(a.getAttribute('rel')).toContain('noopener')
        expect(screen.getByText('CDMX')).toBeTruthy()
    })

    it('honours explicit tones, asc order, custom labels and select', () => {
        const onSelect = vi.fn()
        render(
            <TrackingTimeline
                events={[{ status: 'Intento fallido', at: '2026-10-17', tone: 'problem' }, { status: 'Creado', at: '2026-10-16', tone: 'done' }]}
                order="asc"
                labels={{ tones: { problem: 'Incidencia grave' } }}
                onSelect={onSelect}
                ariaLabel="Seguimiento"
            />,
        )
        expect(screen.getByRole('list', { name: 'Seguimiento' })).toBeTruthy()
        expect(screen.getAllByRole('listitem')[0]?.getAttribute('data-tone')).toBe('done')
        expect(screen.getByText(/Incidencia grave/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Intento fallido/ }))
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ status: 'Intento fallido' }))
    })

    it('empty state', () => {
        render(<TrackingTimeline events={[]} />)
        expect(screen.getByTestId('tracking-empty').textContent).toContain('Aún no hay eventos')
    })
})

describe('helpers', () => {
    it('sortTrackingEvents is stable and order-aware', () => {
        expect(sortTrackingEvents(events, 'asc').map((e) => e.id)).toEqual(['1', '2', '3', '4'])
    })
    it('toTrackingEvents maps server rows incl. coordinates in strings', () => {
        const out = toTrackingEvents([{ id: 'e1', st: 'picked_up', ts: '2026-10-16T10:00:00Z', city: 'CDMX', la: '19.4', ln: '-99.1', d: 'ok' }], { status: 'st', at: 'ts', description: 'd', location: 'city', lat: 'la', lng: 'ln' })
        expect(out[0]).toEqual({ id: 'e1', status: 'picked_up', at: '2026-10-16T10:00:00Z', description: 'ok', location: { label: 'CDMX', lat: 19.4, lng: -99.1 } })
        expect(toTrackingEvents([{ st: 'x', ts: null, city: 'GDL' }], { status: 'st', at: 'ts', location: 'city' })[0]?.location).toBe('GDL')
    })
})
