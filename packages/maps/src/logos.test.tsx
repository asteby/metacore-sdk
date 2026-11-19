// @vitest-environment happy-dom
// Logo / avatar per point: pins of the fan, DOM markers, popup and list headers,
// the logo overlay over the WebGL layers (caps and mosaics), the dark-theme
// attribution and the declarative mappings (genui `image_field`, nav view).
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeclarativeView } from '@asteby/metacore-runtime-react'
import { GenUI, GenUIProvider } from '@asteby/metacore-genui'
import { avatarNode, initialsOf, safeImageUrl } from './avatar'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, popups, resetFakes } from './fake-maplibre'
import { registerGenUIMapBlock } from './genui'
import { LOGO_MARKER_MAX } from './logo-overlay'
import { MapList } from './map-list'
import { MapView } from './map-view'
import { registerMapRenderers } from './register'
import { DEFAULT_LABELS, type MapPointItem } from './types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }) }))

const C = { lat: 23.6, lng: -102.5 }
const LOGO = 'https://cdn.example.com/logo-'
const branded = (n: number, over: (i: number) => Partial<MapPointItem> = () => ({})): MapPointItem[] =>
    Array.from({ length: n }, (_, i) => ({ key: `i${i}`, lat: 19 + i * 0.01, lng: -99 - i * 0.01, label: `Tienda ${i}`, status: 'online', statusLabel: 'En línea', image: `${LOGO}${i}.png`, accent: '#0072B2', ...over(i) }))

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    document.getElementById('metacore-maps-style')?.remove()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(() => {
    cleanup()
    document.documentElement.className = ''
})

async function mount(points: MapPointItem[], props: Partial<React.ComponentProps<typeof MapView>> = {}) {
    render(<MapView points={points} {...props} />)
    await waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))
    return instances[0]!
}
const settle = () => act0()
const act0 = () => new Promise((r) => setTimeout(r, 0))

describe('avatar primitives', () => {
    it('only loads https or same-origin images', () => {
        expect(safeImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
        expect(safeImageUrl('/assets/a.png')).toBe('/assets/a.png')
        for (const bad of ['http://cdn.example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.example/a.png', '/\\evil.example/a.png', '/\t/evil.example/a.png', 'https://user:pw@cdn.example.com/a.png', '', '   ', 42, null, undefined])
            expect(safeImageUrl(bad as never)).toBeUndefined()
        expect(safeImageUrl(`https://x.example/${'a'.repeat(2100)}`)).toBeUndefined()
    })

    it('derives initials from the name', () => {
        expect(initialsOf('Café Norte')).toBe('CN')
        expect(initialsOf('acme')).toBe('AC')
        expect(initialsOf('Sucursal Centro Sur')).toBe('SC')
        expect(initialsOf('— ·')).toBe('')
    })

    it('loads the logo lazily with a no-referrer policy and no CORS mode, and falls back to initials on error', () => {
        const node = avatarNode({ label: 'Café Norte', image: 'https://cdn.example.com/a.png', accent: '#D55E00', ring: '#009E73', size: 40 })
        const img = node.querySelector('img')!
        expect(img.getAttribute('loading')).toBe('lazy')
        expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
        expect(img.getAttribute('crossorigin')).toBeNull()
        expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.png')
        expect(node.getAttribute('role')).toBe('img')
        expect(node.getAttribute('aria-label')).toBe('Café Norte')
        expect(node.style.borderColor).toBe('#009E73')
        img.dispatchEvent(new Event('error'))
        expect(node.querySelector('img')).toBeNull()
        expect(node.textContent).toBe('CN')
        expect(node.style.background).toBe('#D55E00')
    })

    it('uses a neutral background without a brand colour, and ignores unsafe images and colours', () => {
        const node = avatarNode({ label: 'Acme', image: 'http://insecure.example/a.png', accent: 'url(javascript:1)', decorative: true })
        expect(node.querySelector('img')).toBeNull()
        expect(node.getAttribute('aria-hidden')).toBe('true')
        expect(node.getAttribute('role')).toBeNull()
        expect(node.style.background).toBe('#4B5563')
    })
})

describe('markers, list and popup', () => {
    it('a branded DOM marker is a round avatar named by its label, not a dot', async () => {
        const map = await mount([...branded(1), { key: 'plain', lat: 20, lng: -100, label: 'Sin logo', glyph: '3' }], { cluster: false })
        void map
        await waitFor(() => expect(markers).toHaveLength(2))
        const [logo, plain] = markers.map((m) => m.el)
        expect(logo!.className).toContain('mcm-marker--avatar')
        expect(logo!.querySelector('img')?.getAttribute('src')).toBe(`${LOGO}0.png`)
        expect(logo!.getAttribute('aria-label')).toBe('Tienda 0, En línea')
        expect(plain!.className).toContain('mcm-marker--avatar') // one logo on the map: the rest are initials, not dots
        expect(plain!.textContent).toBe('SL')
    })

    it('MapList shows each row with its avatar (logo, else initials) and the subtitle under the name', () => {
        const items = [...branded(1, () => ({ subtitle: 'acme.test' })), { key: 'n', lat: 1, lng: 1, label: 'Beta Norte', accent: '#D55E00' }]
        render(<MapList items={items} labels={DEFAULT_LABELS} />)
        const rows = screen.getAllByRole('listitem')
        expect(rows[0]!.querySelector('img')?.getAttribute('src')).toBe(`${LOGO}0.png`)
        expect(rows[0]!.textContent).toContain('acme.test')
        expect(rows[1]!.querySelector('.mcm-avatar')?.textContent).toBe('BN')
        expect(rows[1]!.querySelector('img')).toBeNull()
    })

    it('MapList without any branding is the same list as before (no avatars)', () => {
        render(<MapList items={[{ key: 'a', lat: 1, lng: 1, label: 'A' }]} labels={DEFAULT_LABELS} />)
        expect(document.querySelector('.mcm-avatar')).toBeNull()
    })

    it('the point popup opens with logo + name + subtitle, then the status chip and the rows', async () => {
        const map = await mount(branded(30, (i) => ({ lat: C.lat, lng: C.lng, subtitle: i === 3 ? 'inst3.example.com' : undefined, details: [{ label: 'Versión', value: '1.2' }] })), { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        // 30 members share one spot: the list popup first, then a member's popup.
        map.emit('click', { features: [{ properties: { key: 'i3' }, geometry: { coordinates: [C.lng, C.lat] } }] }, 'mcm-points-points')
        await waitFor(() => expect(popups.length).toBeGreaterThan(0))
        const list = popups.at(-1)!.node as HTMLElement
        expect(list.querySelector('.mcm-list .mcm-avatar')).toBeTruthy()
        fireEvent.click(list.querySelector('.mcm-list button')!)
        const pop = popups.at(-1)!.node as HTMLElement
        expect(pop.querySelector('.mcm-head .mcm-avatar img')).toBeTruthy()
        expect(pop.querySelector('.mcm-head strong')?.textContent).toBe('Tienda 0')
        expect(pop.querySelector('.mcm-chip')?.textContent).toBe('En línea')
        expect(pop.querySelector('.mcm-k')?.textContent).toBe('Versión')
    })

    it('shows the subtitle in a popup header', async () => {
        const map = await mount([{ ...branded(1)[0]!, subtitle: 'acme.example.com' }], { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        map.emit('click', { features: [{ properties: { key: 'i0' }, geometry: { coordinates: [-99, 19] } }] }, 'mcm-points-points')
        const pop = popups.at(-1)!.node as HTMLElement
        expect(pop.querySelector('.mcm-sub')?.textContent).toBe('acme.example.com')
    })
})

describe('spiderfy with logos', () => {
    const same = (n: number, over: (i: number) => Partial<MapPointItem> = () => ({})) => branded(n, (i) => ({ lat: C.lat, lng: C.lng, ...over(i) }))
    const open = async (pts: MapPointItem[]) => {
        const map = await mount(pts, { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-clusters')).toBe(true))
        map.expansionZoom = 15
        map.emit('click', { features: [{ properties: { cluster_id: 1, point_count: pts.length }, geometry: { coordinates: [C.lng, C.lat] } }] }, 'mcm-points-clusters')
        await waitFor(() => expect(markers.some((m) => m.el.classList.contains('mcm-spider'))).toBe(true))
        return [...markers.find((m) => m.el.classList.contains('mcm-spider'))!.el.querySelectorAll<HTMLButtonElement>('button')]
    }

    it('pins show each instance logo, never its number', async () => {
        const pins = await open(same(6))
        expect(pins).toHaveLength(6)
        for (const [i, p] of pins.entries()) {
            expect(p.classList.contains('mcm-has-avatar')).toBe(true)
            expect(p.querySelector('img')?.getAttribute('src')).toBe(`${LOGO}${i}.png`)
            expect(p.textContent).toBe(initialsOf(`Tienda ${i}`)) // initials sit under the image: no ordinal digits
            expect(p.getAttribute('aria-label')).toBe(`Tienda ${i}, En línea`)
        }
    })

    it('a pin whose logo fails to load shows initials in the brand colour; one without logo or colour shows neutral initials', async () => {
        const pins = await open(same(4, (i) => (i === 1 ? { accent: '#D55E00' } : i === 2 ? { image: undefined, accent: undefined } : {})))
        pins[1]!.querySelector('img')!.dispatchEvent(new Event('error'))
        const a1 = pins[1]!.querySelector<HTMLElement>('.mcm-avatar')!
        expect(a1.querySelector('img')).toBeNull()
        expect(a1.textContent).toBe('T1')
        expect(a1.style.background).toBe('#D55E00')
        expect(pins[2]!.querySelector<HTMLElement>('.mcm-avatar')!.style.background).toBe('#4B5563')
    })

    it('without any logo or brand colour the pins stay numbered', async () => {
        const pins = await open(same(5, () => ({ image: undefined, accent: undefined })))
        expect(pins.map((p) => p.textContent)).toEqual(['1', '2', '3', '4', '5'])
    })
})

describe('logo overlay over the WebGL layers', () => {
    const features = (pts: MapPointItem[]) => pts.map((p) => ({ type: 'Feature', properties: { key: p.key }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }))
    const avatars = () => markers.filter((m) => !m.removed && m.el.classList.contains('mcm-marker--avatar'))

    it('draws avatars over the visible single points and hides the circles under them', async () => {
        const pts = branded(5)
        const map = await mount(pts, { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        map.sourceFeatures.set('mcm-points', features(pts))
        map.emit('idle')
        await waitFor(() => expect(avatars()).toHaveLength(5))
        expect(avatars()[0]!.el.getAttribute('aria-label')).toBe('Tienda 0, En línea')
        expect(JSON.stringify(map.filters.get('mcm-points-points'))).toContain('i0')
        // Clicking an avatar opens the point's popup like its circle would.
        fireEvent.click(avatars()[0]!.el)
        expect((popups.at(-1)!.node as HTMLElement).querySelector('strong')?.textContent).toBe('Tienda 0')
    })

    it(`leaves the circles alone when more than ${LOGO_MARKER_MAX} points are on screen`, async () => {
        const pts = branded(LOGO_MARKER_MAX + 1)
        const map = await mount(pts, { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        map.sourceFeatures.set('mcm-points', features(pts))
        map.emit('idle')
        await settle()
        expect(avatars()).toHaveLength(0)
        expect(JSON.stringify(map.filters.get('mcm-points-points') ?? null)).not.toContain('i0')
    })

    it('skips points outside the viewport and drops avatars that scroll away', async () => {
        const pts = branded(3)
        const map = await mount(pts, { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        map.sourceFeatures.set('mcm-points', features(pts))
        map.inView = ([lng]) => lng > -99.015
        map.emit('idle')
        await waitFor(() => expect(avatars()).toHaveLength(2))
        map.inView = () => false
        map.emit('idle')
        await waitFor(() => expect(avatars()).toHaveLength(0))
    })

    it('does not load the overlay for maps without any logo or brand colour', async () => {
        const map = await mount(branded(3, () => ({ image: undefined, accent: undefined })), { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-points')).toBe(true))
        map.sourceFeatures.set('mcm-points', features(branded(3)))
        map.emit('idle')
        await settle()
        expect(avatars()).toHaveLength(0)
    })

    it('a cluster bubble shows up to 3 member logos and the count', async () => {
        const pts = branded(9, () => ({ lat: 19.4, lng: -99.1 })).map((p, i) => ({ ...p, lat: 19.4 + i * 0.0001 }))
        const map = await mount(pts, { cluster: true })
        await waitFor(() => expect(map.layers.has('mcm-points-clusters')).toBe(true))
        map.clusterLeaves = features(pts)
        map.sourceFeatures.set('mcm-points', [{ type: 'Feature', properties: { cluster_id: 7, point_count: 9 }, geometry: { type: 'Point', coordinates: [-99.1, 19.4] } }])
        map.emit('idle')
        await waitFor(() => expect(document.querySelector('.mcm-mosaic')).toBeTruthy())
        const mosaic = document.querySelector<HTMLElement>('.mcm-mosaic')!
        expect(mosaic.querySelectorAll('.mcm-avatar')).toHaveLength(3)
        expect(mosaic.querySelector('.mcm-mosaic-n')?.textContent).toBe('9')
        expect(mosaic.getAttribute('aria-label')).toBe('9 instancias')
        expect(JSON.stringify(map.filters.get('mcm-points-clusters'))).toContain('7')
    })

    it('an area bubble (country precision) shows up to 3 logos stacked plus "+N" for the rest', async () => {
        const pts = branded(8, () => ({ lat: 14.6, lng: -90.5, precision: 'country' as const, area: 'GT' }))
        const map = await mount(pts)
        await waitFor(() => expect(map.layers.has('mcm-points-areas')).toBe(true))
        map.emit('idle')
        await waitFor(() => expect(document.querySelector('.mcm-mosaic')).toBeTruthy())
        const mosaic = document.querySelector<HTMLElement>('.mcm-mosaic')!
        expect(mosaic.querySelectorAll('.mcm-avatar')).toHaveLength(3)
        expect(mosaic.getAttribute('aria-label')).toBe('GT · 8 instancias')
        expect(mosaic.querySelector('.mcm-mosaic-n')?.textContent).toBe('+5')
        expect(JSON.stringify(map.filters.get('mcm-points-areas'))).toContain('"in"')
        // Clicking it lists the members (a popup here, no host panel): never a fan.
        fireEvent.click(mosaic)
        await waitFor(() => expect(popups.at(-1)?.node?.querySelectorAll('.mcm-list button')).toHaveLength(8))
        expect(markers.some((m) => m.el.classList.contains('mcm-spider'))).toBe(false)
    })
})

describe('attribution contrast', () => {
    it('pins explicit light and dark colours on the attribution (MapLibre sets a white background on the compact control)', async () => {
        await mount(branded(1), { theme: 'dark' })
        expect(screen.getByTestId('metacore-map').className).toContain('mcm-dark')
        const css = document.getElementById('metacore-maps-style')!.textContent!
        const rule = (sel: string) => css.split('}').find((r) => r.trim().startsWith(sel))
        // More specific than MapLibre's `.maplibregl-ctrl-attrib.maplibregl-compact{background:#fff}`.
        expect(rule('.mcm-root.mcm-dark .maplibregl-ctrl.maplibregl-ctrl-attrib,')).toMatch(/background:rgba\(24,28,38,\.88\);color:#e2e8f0/)
        expect(rule('.mcm-root.mcm-dark .maplibregl-ctrl.maplibregl-ctrl-attrib,')).toContain('.maplibregl-compact-show')
        expect(rule('.mcm-root .maplibregl-ctrl.maplibregl-ctrl-attrib,')).toMatch(/background:rgba\(255,255,255,\.88\);color:#1f2937/)
        expect(css).toContain('.mcm-root.mcm-dark .maplibregl-ctrl-attrib a')
    })
})

describe('declarative mappings', () => {
    const rows = [
        { id: 'a', name: 'Acme', host: 'acme.example.com', lat: 19.4, lng: -99.1, status: 'online', logo: 'https://cdn.example.com/acme.png', brand: '#0072B2' },
        { id: 'b', name: 'Beta', host: 'beta.example.com', lat: 20.6, lng: -103.3, status: 'online', logo: 'http://cdn.example.com/beta.png', brand: 'red' },
    ]

    it('genui `image_field` / `color_field` / `subtitle_field` become avatars, with the same safety rules', async () => {
        const undo = registerGenUIMapBlock()
        try {
            const spec = {
                version: 'genui/v2',
                data: { points: { q: 't:hub.Instance?limit=200' } },
                blocks: [{ type: 'map', summary: 'Instancias', source: 'data.points', cluster: false, image_field: 'logo', color_field: 'brand', subtitle_field: 'host', detail_panel: true }],
            }
            render(
                <GenUIProvider sources={{ points: rows }}>
                    <GenUI spec={spec as never} />
                </GenUIProvider>,
            )
            await waitFor(() => expect(markers).toHaveLength(2))
            const [a, b] = markers.map((m) => m.el)
            expect(a!.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/acme.png')
            expect(a!.querySelector<HTMLElement>('.mcm-avatar')!.style.background).toBe('#0072B2')
            // http image and a non-hex colour name are ignored: neutral initials.
            expect(b!.querySelector('img')).toBeNull()
            expect(b!.querySelector('.mcm-avatar')?.textContent).toBe('BE')
            // The URL / colour columns are not repeated as text rows.
            fireEvent.click(a!)
            await waitFor(() => expect(screen.getByLabelText('Acme')).toBeTruthy())
            const panel = screen.getByLabelText('Acme')
            expect(panel.textContent).toContain('acme.example.com')
            expect(panel.textContent).not.toContain('cdn.example.com')
            expect(panel.querySelector('.mcm-avatar')).toBeTruthy()
        } finally {
            undo()
        }
    })

    it('the nav `map` view reads image_field / color_field / subtitle_field', async () => {
        const restore = registerMapRenderers()
        try {
            const view = { map: { point: { lat: 'lat', lng: 'lng' }, popup: ['name'], cluster: false, image_field: 'logo', color_field: 'brand', subtitle_field: 'host' } }
            const data = { list: vi.fn(async () => ({ rows, total: 2 })), record: async () => null, chart: async () => ({}), capability: async () => ({}) }
            render(<DeclarativeView viewType="map" view={view as never} model="Instance" data={data as never} />)
            await waitFor(() => expect(markers).toHaveLength(2))
            expect(markers[0]!.el.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/acme.png')
            fireEvent.click(screen.getByRole('button', { name: 'Ver lista' }))
            const list = screen.getByTestId('map-list')
            expect(list.textContent).toContain('beta.example.com')
            expect(list.querySelectorAll('.mcm-avatar')).toHaveLength(2)
        } finally {
            restore()
        }
    })
})
