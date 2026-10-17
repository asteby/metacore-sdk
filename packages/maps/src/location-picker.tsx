import * as React from 'react'
import { isValidPoint, type GeoPoint } from '@asteby/storefront/geo'
import { useMap } from './context'
import { Marker } from './layers'
import { MapView, type MapViewProps } from './map-view'
import { mergeLabels, type MapLabels } from './types'

export interface GeocodeResult {
    label: string
    lat: number
    lng: number
}

export interface LocationPickerProps extends Pick<MapViewProps, 'center' | 'zoom' | 'height' | 'theme' | 'mapStyle' | 'className'> {
    value?: GeoPoint | null
    onChange: (p: GeoPoint) => void
    labels?: Partial<MapLabels>
    /** Optional search (capability `geo.geocode`, your own service…). Hidden when absent. */
    geocode?: (query: string) => Promise<GeocodeResult[]>
    /** Offer "use my location" (default true). */
    locate?: boolean
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Centers the map on `seq` changes (typed coordinates, search, GPS) but not on pin drags/clicks. */
function Focus({ point, seq }: { point: GeoPoint | null; seq: number }) {
    const { map, reducedMotion } = useMap()
    React.useEffect(() => {
        if (!seq || !point) return
        map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 14), duration: reducedMotion ? 0 : 400 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seq])
    return null
}

/**
 * Pick a place: click the map or drag the pin — or type the coordinates, use
 * the device location, or search an address. The inputs are the accessible
 * path; the map is an enhancement.
 */
export function LocationPicker({ value, onChange, labels: l, geocode, locate = true, ...mapProps }: LocationPickerProps): React.ReactElement {
    const labels = mergeLabels(l)
    const valid = value && isValidPoint(value) ? value : null
    const [lat, setLat] = React.useState(valid ? String(valid.lat) : '')
    const [lng, setLng] = React.useState(valid ? String(valid.lng) : '')
    const [seq, setSeq] = React.useState(valid ? 1 : 0)
    const [query, setQuery] = React.useState('')
    const [results, setResults] = React.useState<GeocodeResult[] | null>(null)
    const hint = React.useId()
    const latId = React.useId()
    const lngId = React.useId()

    React.useEffect(() => {
        if (valid) {
            setLat(String(round(valid.lat)))
            setLng(String(round(valid.lng)))
        }
    }, [valid?.lat, valid?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

    const commitText = (la: string, ln: string) => {
        const p = { lat: Number(la), lng: Number(ln) }
        if (la.trim() && ln.trim() && isValidPoint(p)) {
            onChange(p)
            setSeq((s) => s + 1)
        }
    }
    const set = (p: GeoPoint, focus: boolean) => {
        onChange({ lat: round(p.lat), lng: round(p.lng) })
        if (focus) setSeq((s) => s + 1)
    }
    const useDevice = () => {
        navigator.geolocation?.getCurrentPosition((pos) => set({ lat: pos.coords.latitude, lng: pos.coords.longitude }, true), () => undefined, { enableHighAccuracy: true, timeout: 10000 })
    }
    const search = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!geocode || !query.trim()) return
        try {
            setResults(await geocode(query.trim()))
        } catch {
            setResults([])
        }
    }

    return (
        <div data-testid="location-picker">
            {geocode ? (
                <form onSubmit={search} role="search" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="search" aria-label={labels.search} placeholder={labels.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
                    <button type="submit">{labels.search}</button>
                </form>
            ) : null}
            {results ? (
                results.length === 0 ? (
                    <p role="status">{labels.noResults}</p>
                ) : (
                    <ul aria-label={labels.search} data-testid="geocode-results" style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
                        {results.map((r, i) => (
                            <li key={`${r.lat},${r.lng},${i}`}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        set(r, true)
                                        setResults(null)
                                    }}
                                >
                                    {r.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )
            ) : null}
            <MapView {...mapProps} labels={l} listToggle={false} fit={false} center={mapProps.center ?? (valid ? [valid.lng, valid.lat] : undefined)} zoom={mapProps.zoom ?? (valid ? 14 : undefined)} onMapClick={(p) => set(p, false)}>
                {valid ? <Marker lat={valid.lat} lng={valid.lng} draggable label={labels.point} onDragEnd={(p) => set(p, false)} /> : null}
                <Focus point={valid} seq={seq} />
            </MapView>
            <p id={hint} style={{ fontSize: 12, opacity: 0.75 }}>
                {labels.pickerHint}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <label htmlFor={latId} style={{ display: 'grid', gap: 2, fontSize: 13 }}>
                    {labels.latitude}
                    <input id={latId} inputMode="decimal" aria-describedby={hint} value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => commitText(lat, lng)} onKeyDown={(e) => e.key === 'Enter' && commitText(lat, lng)} />
                </label>
                <label htmlFor={lngId} style={{ display: 'grid', gap: 2, fontSize: 13 }}>
                    {labels.longitude}
                    <input id={lngId} inputMode="decimal" aria-describedby={hint} value={lng} onChange={(e) => setLng(e.target.value)} onBlur={() => commitText(lat, lng)} onKeyDown={(e) => e.key === 'Enter' && commitText(lat, lng)} />
                </label>
                {locate && typeof navigator !== 'undefined' && 'geolocation' in navigator ? (
                    <button type="button" onClick={useDevice}>
                        {labels.useMyLocation}
                    </button>
                ) : null}
            </div>
        </div>
    )
}
