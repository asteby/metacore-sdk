/**
 * The optional map of a shipment: the parcel's route drawn with `@asteby/metacore-maps` (MapLibre, loaded on demand,
 * no API keys). The package is never imported statically: the host passes `loadMaps={() => import('@asteby/metacore-maps')}`
 * (or leaves it out and the tracker shows the timeline alone). A map that cannot load or render disappears without
 * an error: the timeline already carries the same information.
 */
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import type { TrackingPoint } from './points.js'

/** The two exports of `@asteby/metacore-maps` this component needs (loosely typed: the package is an optional peer). */
export type TrackingMapsModule = {
  MapView: ComponentType<Record<string, unknown>>
  Route: ComponentType<Record<string, unknown>>
}
export type TrackingMapsLoader = () => Promise<TrackingMapsModule>

class Boundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch() {
    this.props.onFail()
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

export type TrackingMapProps = {
  points: readonly TrackingPoint[]
  loadMaps: TrackingMapsLoader
  /** Accessible name of the map. */
  label: string
  loadingLabel: string
  height?: number | string
  locale?: string
  className?: string
}

export function TrackingMap({ points, loadMaps, label, loadingLabel, height = 280, locale, className }: TrackingMapProps) {
  const [mod, setMod] = useState<TrackingMapsModule | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  useEffect(() => {
    let live = true
    setState('loading')
    loadMaps()
      .then((m) => {
        if (!live) return
        if (m && typeof m.MapView === 'function' && typeof m.Route === 'function') {
          setMod(m)
          setState('ready')
        } else setState('unavailable')
      })
      .catch(() => live && setState('unavailable'))
    return () => {
      live = false
    }
  }, [loadMaps])
  // Nothing on the server or before mount: a page without JavaScript must not be left with a "loading" placeholder.
  if (points.length === 0 || state === 'idle' || state === 'unavailable') return null
  if (state === 'loading' || !mod) {
    return (
      <p className={className} data-sf-tracking-map-loading role="status">
        {loadingLabel}
      </p>
    )
  }
  const { MapView, Route } = mod
  const items = points.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, label: p.label || label, ...(p.status ? { status: p.status } : {}) }))
  return (
    <div className={className} data-sf-tracking-map>
      <Boundary onFail={() => setState('unavailable')}>
        <MapView points={items} height={height} ariaLabel={label} {...(locale ? { locale } : {})} cluster={false}>
          {points.length > 1 ? <Route path={points.map((p) => ({ lat: p.lat, lng: p.lng }))} stops={false} dashed /> : null}
        </MapView>
      </Boundary>
    </div>
  )
}
