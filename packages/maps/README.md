# @asteby/metacore-maps

Lazy maps for the metacore ERP and its addons. One package, three jobs:

- **Components** — `MapView`, `Marker`, `ClusterLayer`, `Polyline`/`Route`, `Geofence`, `LocationPicker`, `TrackingTimeline`.
- **Declarative renderers** — `view_type: map` and `kind: map | timeline` detail panels of the kernel's manifest, registered in `@asteby/metacore-runtime-react`'s registry.
- **No lock-in, no keys** — [MapLibre GL](https://maplibre.org) renders; the base map is a style (or PMTiles) **URL your host serves**. No API key, no third party seeing your customers' locations.

Performance contract (plan §0.2): the package's own initial chunk is **~11 KB gzip** (enforced by `src/size-budget.test.ts`, limit 15 KB) and `maplibre-gl` is **never** in a static import graph — it is fetched the first time a map mounts. The registration entry (`/register`) is under 1 KB, so a host that never shows a map pays almost nothing.

## Install

```bash
pnpm add @asteby/metacore-maps maplibre-gl
# optional, only for pmtiles:// base maps
pnpm add pmtiles
```

`react`, `maplibre-gl` and (for the renderers) `@asteby/metacore-runtime-react`, `@asteby/metacore-sdk`, `react-i18next` are peers. In a federated page `@asteby/metacore-maps` and `maplibre-gl` are lazy shares (`METACORE_PAGE_SHARES`): the remote never bundles its own copy.

## Configure the base map (once, in the host)

```ts
import { configureMaps } from '@asteby/metacore-maps'

configureMaps({
  style: {
    light: 'https://cdn.example.com/map/light.json', // style JSON URL, or an inline style object
    dark: 'https://cdn.example.com/map/dark.json',
  },
  // PMTiles (self-hosted, range requests, no key): style sources use `pmtiles://https://…/mx.pmtiles`.
  pmtiles: () => import('pmtiles'),
  attribution: '© OpenStreetMap contributors', // credit for the data in the tiles you serve
  center: [-102.5, 23.6], zoom: 4,             // used when there is nothing to fit
})
```

Without `style` the map draws on a plain themed background (your points, routes and zones still render) and makes **no** network request besides MapLibre itself. Helpers: `blankStyle(scheme)`, `rasterStyle(['https://tiles/{z}/{x}/{y}.png'], attribution)`.

The colour scheme follows the host (`.dark` class / `data-theme="dark"` on `<html>`, then the OS); pass `theme="light|dark"` to pin it. Layers survive a theme switch.

## Components

```tsx
import { MapView, Route, Geofence, LocationPicker, TrackingTimeline } from '@asteby/metacore-maps'

// Points with popups (focusable markers; clusters automatically above 150 points)
<MapView
  ariaLabel="Envíos activos"
  points={[
    { key: 's1', lat: 19.43, lng: -99.13, label: 'TRK-1', status: 'in_transit', statusLabel: 'En tránsito',
      details: [{ label: 'Paquetería', value: 'DHL' }] },
  ]}
  colors={{ in_transit: '#0072B2' }}
  onSelect={(p) => console.log(p.key)}
>
  {/* layers and extra markers are children */}
  <Route path={[{ lat: 19.4, lng: -99.1 }, { lat: 19.9, lng: -100.2 }]} fit />
  <Geofence zones={[{ key: 'z', label: 'Cobertura', center: { lat: 19.43, lng: -99.13 }, radiusM: 5000 }]} />
</MapView>

// Pick a place: click, drag the pin, type coordinates, device GPS, optional address search
<LocationPicker value={point} onChange={setPoint} geocode={(q) => api.geocode(q)} />

// Shipment tracking — no map required
<TrackingTimeline
  events={[{ status: 'En tránsito', at: '2026-10-17T09:00:00Z', location: { label: 'Querétaro', lat: 20.59, lng: -100.39 } }]}
  timeZone="America/Mexico_City"
/>
```

| Export | What it does |
|---|---|
| `MapView` | Container + lazy MapLibre. Props: `points`, `cluster`, `colors`, `fit`, `theme`, `mapStyle`, `height`, `labels`, `selectedKey`, `onSelect`, `onMapClick`, `listExtra`, children. |
| `Marker` | Focusable DOM marker (`aria-label`, glyph, popup children, `draggable`). A few hundred at most. |
| `ClusterLayer` | WebGL points with native clustering for thousands of features. |
| `Polyline` / `Route` | Line over ordered points; `Route` adds numbered stops. Straight segments — no routing service needed. |
| `Geofence` | Polygons and circles (`center` + `radiusM`). |
| `LocationPicker` | Map + labelled latitude/longitude inputs (the accessible path) + GPS + optional geocoder. |
| `TrackingTimeline` | Status / time / place events, with state spelled out in words. Helpers `toTrackingEvents`, `sortTrackingEvents`. |
| `MapList` | The list equivalent of a map (used by `MapView`). |
| `configureMaps`, `loadMaplibre`, `useMap`, `useMapScheme` | Host config, the shared lazy loader, and hooks for custom layers. |
| `distanceKm`, `formatDistance`, `isValidPoint`, `parseLatLng`, `directionsUrl` | Re-exported from `@asteby/storefront/geo` — the one geo module shared with the storefronts. |

### Accessibility

- Every map has an equivalent **list** ("Ver lista"), keyboard reachable, with each status written out and an "open in map" link. When WebGL or MapLibre are unavailable the list is the only view and a message says so.
- Markers are buttons with `aria-label`; colour is never the only channel (status text, glyphs); popups are built from text nodes (no HTML injection).
- `prefers-reduced-motion` makes `fitBounds` / `easeTo` instant. Strings are overridable through `labels` (and `metacore.maps.*` keys in the renderers).

## Declarative views (kernel contract)

```ts
// host start-up — tiny and MapLibre-free
import { registerMapRenderers } from '@asteby/metacore-maps/register'

registerMapRenderers({ config: { style: { light: '…', dark: '…' } } })
```

This calls `registerViewRenderer('map', …)`, `registerPanelRenderer('map', …)` and `registerPanelRenderer('timeline', …)` with lazy loaders (`/view`, `/panel`, `/timeline-panel`). Pass `{ timeline: false }` to keep the runtime's built-in timeline panel. Manifest fragments it renders:

```jsonc
{ "view_type": "map",
  "view": { "map": { "point": { "lat": "dest_lat", "lng": "dest_lng" }, "color_by": "status",
                      "popup": ["tracking_number", "carrier", "status"], "cluster": true,
                      "layers": [{ "kind": "points", "model": "Branch", "point": { "lat": "lat", "lng": "lng" }, "label": "name" },
                                 { "kind": "zones",  "model": "Zone",   "geometry": "area", "label": "name" }] } } }

{ "kind": "map",      "map": { "point": {…}, "route": { "relation": "stops", "point": {…}, "order_by": "seq" } } }
{ "kind": "timeline", "timeline": { "date_field": "at", "title_field": "description", "status_field": "status",
                                    "source": { "capability": "commerce.shipping.track", "input": { "tracking_number": "record.tracking_number" }, "items": "events" } } }
```

Rows become features through the same pure helpers the runtime uses for its list fallback (`@asteby/metacore-runtime-react/views/map`), so both renderers read the manifest identically. Option colours and labels of the `color_by` column come from the model metadata; renderers display what the server returns and never compute business values. Timeline events pick up `location`/`city` and `lat`/`lng` columns when present.

## Testing

jsdom/happy-dom have no WebGL. In your own tests pass a stub through the loader:

```ts
configureMaps({ loadMaplibre: async () => myStub, supportsWebGL: () => true })
```
