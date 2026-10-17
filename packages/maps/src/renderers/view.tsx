// `view_type: map` renderer (registered by `registerMapRenderers`). It reads
// the manifest through the same pure helpers as the runtime's list fallback
// (`@asteby/metacore-runtime-react/views/map`), so both interpret `point`,
// `geometry`, `color_by` and `popup` identically — this one draws them.
import * as React from 'react'
import type { ViewRendererProps } from '@asteby/metacore-runtime-react'
import { toMapFeatures } from '@asteby/metacore-runtime-react/views/map'
import { Geofence } from '../layers'
import { MapView } from '../map-view'
import { colorFor } from '../palette'
import type { MapPointItem, ZoneItem } from '../types'
import { MAX_FEATURES, statusMaps, toZones, useMapLabels } from './shared'

type Row = Record<string, unknown>

export default function MapViewRenderer({ model, view, metadata, data, onOpenRecord, locale, className }: ViewRendererProps<'map'>) {
    const labels = useMapLabels()
    const [rows, setRows] = React.useState<Row[] | null>(null)
    const [layerRows, setLayerRows] = React.useState<Array<{ kind: string; rows: Row[]; index: number }>>([])
    const [error, setError] = React.useState(false)
    const [selected, setSelected] = React.useState<MapPointItem | null>(null)
    const layers = view.layers
    const layersSig = JSON.stringify(layers ?? [])

    React.useEffect(() => {
        let cancelled = false
        setError(false)
        Promise.all([
            data.list(model, { per_page: MAX_FEATURES }),
            ...(layers ?? []).map((l) => data.list(l.model, { per_page: MAX_FEATURES }).then((r) => ({ kind: l.kind, rows: r.rows }), () => ({ kind: l.kind, rows: [] as Row[] }))),
        ]).then(
            ([main, ...extra]) => {
                if (cancelled) return
                setRows((main as { rows: Row[] }).rows)
                setLayerRows((extra as Array<{ kind: string; rows: Row[] }>).map((e, index) => ({ ...e, index })))
            },
            () => !cancelled && setError(true),
        )
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, model, layersSig])

    const { colors, names } = React.useMemo(() => statusMaps(metadata, view.color_by), [metadata, view.color_by])

    const { points, byKey } = React.useMemo(() => {
        const map = new Map<string, Row>()
        const items: MapPointItem[] = []
        for (const f of toMapFeatures(rows ?? [], view)) {
            map.set(f.key, f.row)
            const [first, ...rest] = f.popup
            items.push({
                key: f.key,
                lat: f.lat,
                lng: f.lng,
                label: first?.value || f.key,
                status: f.color,
                statusLabel: f.color ? names[f.color] : undefined,
                details: rest.filter((p) => p.value).map((p) => ({ label: metadata?.columns?.find((c) => c.key === p.field)?.label ?? p.field, value: p.value })),
            })
        }
        // Extra layers of kind "points": other models drawn in their own hue.
        ;(layers ?? []).forEach((l, i) => {
            if (l.kind !== 'points') return
            const feats = toMapFeatures(layerRows.find((x) => x.index === i)?.rows ?? [], { point: l.point, geometry: l.geometry, popup: l.label ? [l.label] : [] })
            for (const f of feats) {
                items.push({ key: `${i}:${f.key}`, lat: f.lat, lng: f.lng, label: f.popup[0]?.value || l.model, color: colorFor(`layer:${l.model}`), status: l.model })
            }
        })
        return { points: items, byKey: map }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, layerRows, view, names, metadata])

    const zones = React.useMemo<ZoneItem[]>(
        () =>
            (layers ?? []).flatMap((l, i) =>
                l.kind === 'zones' && l.geometry ? toZones(layerRows.find((x) => x.index === i)?.rows ?? [], l.geometry, l.label) : [],
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [layerRows, layersSig],
    )

    if (error) {
        return (
            <p role="alert" style={{ color: 'var(--destructive, #b91c1c)', fontSize: 14 }}>
                {labels.unavailable}
            </p>
        )
    }
    if (!rows) return <div aria-busy="true" style={{ height: 360 }} role="status" aria-label={labels.loading} />
    const row = selected ? byKey.get(selected.key) : undefined
    return (
        <div className={className} data-testid="maps-view-renderer">
            <MapView
                points={points}
                cluster={view.cluster}
                colors={colors}
                fit={view.fit !== 'org_default'}
                height="min(70vh, 560px)"
                labels={labels}
                locale={locale}
                selectedKey={selected?.key ?? null}
                onSelect={setSelected}
                listExtra={zones.length ? <ul aria-label={labels.zone}>{zones.map((z) => <li key={z.key}>{z.label || z.key}</li>)}</ul> : undefined}
            >
                {zones.length ? <Geofence zones={zones} fit={view.fit !== 'org_default' && points.length === 0} /> : null}
            </MapView>
            {row && onOpenRecord ? (
                <p style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => onOpenRecord(row)}>
                        {selected?.label}
                    </button>
                </p>
            ) : null}
        </div>
    )
}
