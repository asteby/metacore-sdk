// A recording stand-in for `maplibre-gl` used by the tests (jsdom/happy-dom has
// no WebGL). It implements the slice of the API the package calls and keeps
// every call so tests can assert on what would have been drawn.
import type { MapLibreModule } from './config'

type Handler = (e: any) => void

export interface FakeMapState {
    options: Record<string, any>
    sources: Map<string, any>
    layers: Map<string, any>
    calls: Array<[string, ...unknown[]]>
    handlers: Map<string, Handler[]>
    removed: boolean
    style: unknown
}

export const instances: FakeMap[] = []
export const markers: FakeMarker[] = []
export const popups: FakePopup[] = []
export const protocols: string[] = []

export class FakeMap implements FakeMapState {
    options: Record<string, any>
    sources = new Map<string, any>()
    layers = new Map<string, any>()
    calls: Array<[string, ...unknown[]]> = []
    handlers = new Map<string, Handler[]>()
    removed = false
    style: unknown
    zoom = 4
    constructor(options: Record<string, any>) {
        this.options = options
        this.style = options.style
        instances.push(this)
        // MapLibre fires `load` asynchronously once the style is ready.
        queueMicrotask(() => {
            this.emit('style.load')
            this.emit('load')
        })
    }
    private key(type: string, layer?: string) {
        return layer ? `${type}:${layer}` : type
    }
    on(type: string, a: any, b?: Handler) {
        const k = typeof a === 'string' ? this.key(type, a) : type
        const fn = (typeof a === 'string' ? b : a) as Handler
        this.handlers.set(k, [...(this.handlers.get(k) ?? []), fn])
        return this
    }
    once(type: string, fn: Handler) {
        const wrapped: Handler = (e) => {
            this.off(type, wrapped)
            fn(e)
        }
        return this.on(type, wrapped)
    }
    off(type: string, a: any, b?: Handler) {
        const k = typeof a === 'string' ? this.key(type, a) : type
        const fn = typeof a === 'string' ? b : a
        this.handlers.set(k, (this.handlers.get(k) ?? []).filter((h) => h !== fn))
        return this
    }
    emit(type: string, e: any = {}, layer?: string) {
        for (const h of [...(this.handlers.get(this.key(type, layer)) ?? [])]) h(e)
    }
    addControl(c: unknown, pos?: string) {
        this.calls.push(['addControl', (c as { kind?: string }).kind, pos])
    }
    addSource(id: string, spec: any) {
        this.sources.set(id, { ...spec, setData: (d: unknown) => ((this.sources.get(id).data = d), this.calls.push(['setData', id, d])), getClusterExpansionZoom: async () => 9 })
    }
    getSource(id: string) {
        return this.sources.get(id)
    }
    addLayer(spec: any) {
        this.layers.set(spec.id, spec)
    }
    getLayer(id: string) {
        return this.layers.get(id)
    }
    removeLayer(id: string) {
        this.layers.delete(id)
    }
    removeSource(id: string) {
        this.sources.delete(id)
    }
    getStyle() {
        return typeof this.style === 'object' ? this.style : {}
    }
    setStyle(style: unknown, opts?: unknown) {
        this.style = style
        this.sources.clear()
        this.layers.clear()
        this.calls.push(['setStyle', style, opts])
        queueMicrotask(() => this.emit('style.load'))
    }
    fitBounds(b: unknown, o: unknown) {
        this.calls.push(['fitBounds', b, o])
    }
    easeTo(o: unknown) {
        this.calls.push(['easeTo', o])
    }
    getZoom() {
        return this.zoom
    }
    getCanvas() {
        return document.createElement('canvas')
    }
    remove() {
        this.removed = true
    }
}

export class FakeMarker {
    el: HTMLElement
    lngLat: [number, number] = [0, 0]
    popup: FakePopup | null = null
    handlers = new Map<string, Handler>()
    removed = false
    constructor(o: { element: HTMLElement; draggable?: boolean }) {
        this.el = o.element
        markers.push(this)
    }
    setLngLat(ll: [number, number]) {
        this.lngLat = ll
        return this
    }
    getLngLat() {
        return { lng: this.lngLat[0], lat: this.lngLat[1] }
    }
    addTo(map: FakeMap) {
        void map
        document.body.appendChild(this.el)
        return this
    }
    setPopup(p: FakePopup | null) {
        this.popup = p
        return this
    }
    on(type: string, fn: Handler) {
        this.handlers.set(type, fn)
        return this
    }
    remove() {
        this.removed = true
        this.el.remove()
    }
    /** Test helper: finish a drag at a place. */
    dragTo(lng: number, lat: number) {
        this.lngLat = [lng, lat]
        this.handlers.get('dragend')?.({})
    }
}

export class FakePopup {
    node: Node | null = null
    ll: unknown
    constructor(public options?: unknown) {
        popups.push(this)
    }
    setLngLat(ll: unknown) {
        this.ll = ll
        return this
    }
    setDOMContent(n: Node) {
        this.node = n
        return this
    }
    addTo() {
        return this
    }
}

export const fakeMaplibre = {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    NavigationControl: class {
        kind = 'navigation'
    },
    AttributionControl: class {
        kind = 'attribution'
        constructor(public o?: unknown) {}
    },
    addProtocol: (name: string) => {
        protocols.push(name)
    },
} as unknown as MapLibreModule

export function resetFakes(): void {
    instances.length = 0
    markers.length = 0
    popups.length = 0
    protocols.length = 0
}
