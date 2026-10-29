import type { TrackingView } from '@asteby/storefront'
import { isValidPoint } from '@asteby/storefront/geo'
import { useEffect, useState } from 'react'
import { str } from '../account/orders-ui.js'

/** A point of the parcel's route, oldest first. `label` is a city or state, never an address. */
export type TrackingPoint = { key: string; lat: number; lng: number; label: string; status?: string }

/** Optional host geocoder: a place text (`"Monterrey, NL"`) → a point, or `null`. The SDK never calls a geocoding service by itself. */
export type TrackingGeocoder = (place: string) => Promise<{ lat: number; lng: number } | null>

const MAX_GEOCODED = 8

/**
 * The route the server already knows: the `map.path` hints when it sent them, else the scans that carry `lat` / `lng`.
 * Oldest first, consecutive repeats dropped. Empty when the carrier reports no coordinates.
 */
export function trackingPoints(tracking: Pick<TrackingView, 'events' | 'map'> | null | undefined): TrackingPoint[] {
  if (!tracking) return []
  const out: TrackingPoint[] = []
  const push = (p: TrackingPoint) => {
    const last = out[out.length - 1]
    if (!isValidPoint(p) || (last && last.lat === p.lat && last.lng === p.lng)) return
    out.push(p)
  }
  const hints = tracking.map
  if (hints?.path?.length) {
    if (hints.origin) push({ key: 'origin', lat: hints.origin.lat, lng: hints.origin.lng, label: str(hints.origin.label) ?? '' })
    hints.path.forEach((h, i) => push({ key: `path-${i}`, lat: h.lat, lng: h.lng, label: str(h.label) ?? '' }))
    if (hints.destination) push({ key: 'destination', lat: hints.destination.lat, lng: hints.destination.lng, label: str(hints.destination.label) ?? '' })
    if (out.length) return out
  }
  const scans = [...(Array.isArray(tracking.events) ? tracking.events : [])].reverse()
  scans.forEach((e, i) => {
    if (typeof e?.lat === 'number' && typeof e?.lng === 'number') push({ key: `scan-${i}`, lat: e.lat, lng: e.lng, label: str(e.location) ?? '', status: typeof e.status === 'string' ? e.status : '' })
  })
  return out
}

/** The distinct places of the scans, oldest first (what a geocoder would be asked about). */
export function trackingPlaces(tracking: Pick<TrackingView, 'events'> | null | undefined): string[] {
  const seen = new Set<string>()
  const places: string[] = []
  for (const e of [...(tracking?.events ?? [])].reverse()) {
    const p = str(e?.location)
    if (p && !seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase())
      places.push(p)
    }
  }
  return places.slice(0, MAX_GEOCODED)
}

/** Known points, or — with a `geocode` — the scans' places turned into points (cancelled on unmount; a failed place is skipped). */
export function useTrackingPoints(tracking: TrackingView | null | undefined, geocode?: TrackingGeocoder): TrackingPoint[] {
  const known = trackingPoints(tracking)
  const [found, setFound] = useState<TrackingPoint[]>([])
  const places = known.length === 0 && geocode ? trackingPlaces(tracking) : []
  const dep = places.join('|')
  useEffect(() => {
    if (!geocode || places.length === 0) {
      setFound([])
      return
    }
    let live = true
    void Promise.all(places.map((p) => geocode(p).catch(() => null))).then((res) => {
      if (!live) return
      const pts: TrackingPoint[] = []
      res.forEach((r, i) => {
        const point = r && { key: `place-${i}`, lat: r.lat, lng: r.lng, label: places[i]! }
        if (point && isValidPoint(point)) pts.push(point)
      })
      setFound(pts)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, geocode])
  return known.length ? known : found
}
