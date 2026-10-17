// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, resetFakes } from './fake-maplibre'
import { LocationPicker } from './location-picker'
import type { GeoPoint } from './types'

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(cleanup)

const ready = () => waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))

function Harness({ initial = null, onChange, geocode }: { initial?: GeoPoint | null; onChange?: (p: GeoPoint) => void; geocode?: React.ComponentProps<typeof LocationPicker>['geocode'] }) {
    const [v, setV] = React.useState<GeoPoint | null>(initial)
    return (
        <LocationPicker
            value={v}
            geocode={geocode}
            onChange={(p) => {
                setV(p)
                onChange?.(p)
            }}
        />
    )
}

describe('<LocationPicker>', () => {
    it('clicking the map places the pin and reports the point', async () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        await ready()
        expect(markers).toHaveLength(0)
        instances[0]!.emit('click', { lngLat: { lng: -99.1332123456, lat: 19.4326123456 } })
        expect(onChange).toHaveBeenCalledWith({ lat: 19.432612, lng: -99.133212 })
        await waitFor(() => expect(markers).toHaveLength(1))
        expect(screen.getByRole('button', { name: 'Ubicación' })).toBeTruthy()
        expect((screen.getByLabelText('Latitud') as HTMLInputElement).value).toBe('19.432612')
    })

    it('dragging the pin updates the point', async () => {
        const onChange = vi.fn()
        render(<Harness initial={{ lat: 19, lng: -99 }} onChange={onChange} />)
        await ready()
        await waitFor(() => expect(markers).toHaveLength(1))
        markers[0]!.dragTo(-100, 20)
        expect(onChange).toHaveBeenLastCalledWith({ lat: 20, lng: -100 })
    })

    it('typed coordinates are the keyboard path: valid ones commit on Enter/blur and recentre', async () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        await ready()
        const lat = screen.getByLabelText('Latitud')
        const lng = screen.getByLabelText('Longitud')
        fireEvent.change(lat, { target: { value: '20.5' } })
        fireEvent.change(lng, { target: { value: '-103.4' } })
        fireEvent.keyDown(lng, { key: 'Enter' })
        expect(onChange).toHaveBeenCalledWith({ lat: 20.5, lng: -103.4 })
        await waitFor(() => expect(instances[0]?.calls.some((c) => c[0] === 'easeTo' && (c[1] as { center: number[] }).center[0] === -103.4)).toBe(true))
    })

    it('rejects out-of-range coordinates', async () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        await ready()
        fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '95' } })
        fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '10' } })
        fireEvent.blur(screen.getByLabelText('Longitud'))
        expect(onChange).not.toHaveBeenCalled()
    })

    it('searches an address through the host-provided geocoder', async () => {
        const geocode = vi.fn(async () => [{ label: 'Centro, CDMX', lat: 19.43, lng: -99.13 }])
        const onChange = vi.fn()
        render(<Harness geocode={geocode} onChange={onChange} />)
        await ready()
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: '06000' } })
        fireEvent.submit(screen.getByRole('search'))
        fireEvent.click(await screen.findByRole('button', { name: 'Centro, CDMX' }))
        expect(geocode).toHaveBeenCalledWith('06000')
        expect(onChange).toHaveBeenCalledWith({ lat: 19.43, lng: -99.13 })
    })

    it('has no search form without a geocoder', async () => {
        render(<Harness />)
        await ready()
        expect(screen.queryByRole('search')).toBeNull()
    })

    it('still works with inputs when the map cannot render', () => {
        configureMaps({ supportsWebGL: () => false })
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '19.4' } })
        fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '-99.1' } })
        fireEvent.blur(screen.getByLabelText('Longitud'))
        expect(onChange).toHaveBeenCalledWith({ lat: 19.4, lng: -99.1 })
    })
})
