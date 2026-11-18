// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, popups, resetFakes } from './fake-maplibre'
import { MapView } from './map-view'
import type { MapPointItem } from './types'

const C = { lat: 23.6, lng: -102.5 }
const same: MapPointItem[] = Array.from({ length: 12 }, (_, i) => ({ key: `s${i}`, ...C, label: `Inst ${i}`, status: 'online', statusLabel: 'En línea' }))
const apart: MapPointItem[] = [
    { key: 'p1', lat: 19.4, lng: -99.1, label: 'Uno' },
    { key: 'p2', lat: 20.6, lng: -103.3, label: 'Dos' },
]

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(() => {
    cleanup()
    document.documentElement.className = ''
})

async function mount(points: MapPointItem[], props: Partial<React.ComponentProps<typeof MapView>> = {}) {
    render(<MapView points={points} cluster {...props} />)
    await waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))
    const map = instances[0]!
    await waitFor(() => expect(map.layers.has('mcm-points-clusters')).toBe(true))
    return map
}
const clusterFeature = (count: number) => ({ properties: { cluster_id: 1, point_count: count }, geometry: { coordinates: [C.lng, C.lat] } })
const easeCalls = (map: { calls: Array<[string, ...unknown[]]> }) => map.calls.filter((c) => c[0] === 'easeTo').map((c) => c[1] as { zoom: number })
const lastPopup = () => popups[popups.length - 1]!

describe('cluster click', () => {
    it('fans the members out instead of flying to max zoom when they share coordinates', async () => {
        const onSelect = vi.fn()
        const map = await mount(same, { onSelect })
        map.expansionZoom = 15
        map.emit('click', { features: [clusterFeature(12)] }, 'mcm-points-clusters')
        await waitFor(() => expect(markers).toHaveLength(1))
        const pins = [...markers[0]!.el.querySelectorAll('button')]
        expect(pins).toHaveLength(12)
        expect(pins[0]!.getAttribute('aria-label')).toBe('Inst 0, En línea')
        expect(easeCalls(map).some((c) => c.zoom > 14)).toBe(false)
        fireEvent.click(pins[3]!)
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 's3' }))
        // The pin opens a popup with a status chip, and only centres (neighbours share the spot).
        const pop = lastPopup().node as HTMLElement
        expect(pop.querySelector('strong')?.textContent).toBe('Inst 3')
        expect(pop.querySelector('.mcm-chip')?.textContent).toBe('En línea')
        expect(easeCalls(map).at(-1)?.zoom).toBe(map.zoom)
    })

    it('lists (10 + "+N más") when too many share the spot to fan out', async () => {
        const crowd = Array.from({ length: 30 }, (_, i): MapPointItem => ({ key: `c${i}`, ...C, label: `Nodo ${i}` }))
        const map = await mount(crowd)
        map.expansionZoom = 15
        map.emit('click', { features: [clusterFeature(30)] }, 'mcm-points-clusters')
        await waitFor(() => expect(popups.some((p) => p.node?.querySelector('ul'))).toBe(true))
        const list = lastPopup().node as HTMLElement
        expect(list.querySelectorAll('button')).toHaveLength(10)
        expect(list.textContent).toContain('30 instancias')
        expect(list.textContent).toContain('+20 más')
        expect(markers).toHaveLength(0)
    })

    it('fans a small cluster whose leaves are all coincident even if the expansion zoom looks fine', async () => {
        const map = await mount(same.slice(0, 3), { fit: false })
        map.expansionZoom = 9
        map.emit('click', { features: [clusterFeature(3)] }, 'mcm-points-clusters')
        await waitFor(() => expect(markers).toHaveLength(1))
        expect(easeCalls(map)).toHaveLength(0)
    })

    it('zooms normally (capped at 14) when the members do separate', async () => {
        const map = await mount(apart)
        map.expansionZoom = 7
        map.emit('click', { features: [clusterFeature(2)] }, 'mcm-points-clusters')
        await waitFor(() => expect(easeCalls(map)).toHaveLength(1))
        expect(easeCalls(map)[0]!.zoom).toBe(7)
        expect(popups.some((p) => p.node?.querySelector('ul'))).toBe(false)
    })
})

describe('hover tooltip', () => {
    it('shows label and status over a point, plain text, and hides on leave', async () => {
        const evil: MapPointItem = { key: 'x', lat: 1, lng: 1, label: '<img src=x onerror=alert(1)>', statusLabel: 'En línea' }
        const map = await mount([evil, ...apart])
        map.emit('mouseenter', { features: [{ properties: { key: 'x' }, geometry: { coordinates: [1, 1] } }] }, 'mcm-points-points')
        const tip = lastPopup()
        expect((tip.options as { className?: string }).className).toBe('mcm-tooltip')
        const node = tip.node as HTMLElement
        expect(node.getAttribute('role')).toBe('tooltip')
        expect(node.textContent).toBe('<img src=x onerror=alert(1)>En línea')
        expect(node.querySelector('img')).toBeNull()
        map.emit('mouseleave', {}, 'mcm-points-points')
        expect(tip.removed).toBe(true)
    })

    it('says "N instancias" over a cluster', async () => {
        const map = await mount(same)
        map.emit('mouseenter', { features: [clusterFeature(12)] }, 'mcm-points-clusters')
        expect(lastPopup().node?.textContent).toBe('12 instancias')
    })
})

describe('selectZoom', () => {
    const pick = async (label: string) => {
        fireEvent.click(screen.getByRole('button', { name: /Ver lista/ }))
        fireEvent.click(screen.getByRole('button', { name: label }))
    }
    it('defaults to 13 for a lone point', async () => {
        const map = await mount(apart)
        await pick('Uno')
        expect(easeCalls(map).at(-1)?.zoom).toBe(13)
    })
    it('honours a custom selectZoom', async () => {
        const map = await mount(apart, { selectZoom: 9 })
        await pick('Dos')
        expect(easeCalls(map).at(-1)?.zoom).toBe(9)
    })
    it('only centres when other points share the coordinates', async () => {
        const map = await mount(same.slice(0, 2))
        await pick('Inst 1')
        expect(easeCalls(map).at(-1)?.zoom).toBe(map.zoom)
    })
})

describe('theme contrast', () => {
    it('lifts the cluster and thickens the rings on the dark scheme', async () => {
        const light = await mount(apart)
        const lp = light.layers.get('mcm-points-clusters').paint
        cleanup()
        resetFakes()
        document.documentElement.classList.add('dark')
        const dark = await mount(apart)
        const dp = dark.layers.get('mcm-points-clusters').paint
        expect(dp['circle-color']).not.toBe(lp['circle-color'])
        expect(dp['circle-stroke-color']).toBe('#ffffff')
        expect(dp['circle-stroke-width']).toBeGreaterThan(lp['circle-stroke-width'])
        expect(dark.layers.get('mcm-points-points').paint['circle-stroke-width']).toBe(3)
    })
})
