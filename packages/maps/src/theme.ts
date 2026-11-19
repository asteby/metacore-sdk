import * as React from 'react'
import type { MapScheme } from './config'
import { DEFAULT_COLOR, readableOn } from './palette'

function detect(): MapScheme {
    if (typeof document === 'undefined') return 'light'
    const root = document.documentElement
    const attr = root.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') return attr
    if (root.classList.contains('dark')) return 'dark'
    if (root.classList.contains('light')) return 'light'
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Colour scheme the map follows: the host's `.dark` class / `data-theme`
 * (the metacore theme package sets them), else the OS preference. `theme`
 * pins it. Re-evaluates when the class/attribute or the OS setting changes.
 */
export function useMapScheme(theme: MapScheme | 'auto' = 'auto'): MapScheme {
    const [scheme, setScheme] = React.useState<MapScheme>(theme === 'auto' ? detect : theme)
    React.useEffect(() => {
        if (theme !== 'auto') {
            setScheme(theme)
            return
        }
        const update = () => setScheme(detect())
        update()
        const mo = new MutationObserver(update)
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
        const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
        mq?.addEventListener?.('change', update)
        return () => {
            mo.disconnect()
            mq?.removeEventListener?.('change', update)
        }
    }, [theme])
    return scheme
}

export function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const DARK_CLUSTER = '#56B4E9'

export interface PointsPaint {
    clusterColor: string
    clusterText: string
    stroke: string
    clusterStrokeWidth: number
    pointStrokeWidth: number
    /** Soft ring under points and bubbles, so they stand out on any base map. */
    halo: string
}

/** Cluster / point paint per scheme: on the dark base map the Okabe-Ito blue is lifted and ringed in white so it does not sink. */
export function pointsPaint(scheme: MapScheme): PointsPaint {
    return scheme === 'dark'
        ? { clusterColor: DARK_CLUSTER, clusterText: readableOn(DARK_CLUSTER), stroke: '#ffffff', clusterStrokeWidth: 4, pointStrokeWidth: 3, halo: 'rgba(255,255,255,0.35)' }
        : { clusterColor: DEFAULT_COLOR, clusterText: readableOn(DEFAULT_COLOR), stroke: '#ffffff', clusterStrokeWidth: 3, pointStrokeWidth: 2, halo: 'rgba(17,24,39,0.22)' }
}
