// genui/v2 `map` block (ADR 0001 del SDK): a declarative facade over this
// package's primitives (MapView, Marker, ClusterLayer, MapList). It adds what
// a block needs and the primitives do not: tone-by-status colours, a legend by
// grouping, a hover tooltip and a side detail panel. Nothing here draws the
// map itself. Call `registerGenUIMapBlock()` once at host start-up; MapLibre
// still loads only when a `map` block actually renders.
import * as React from 'react'
import {
    mapLegend,
    normalizeMapPoints,
    registerGenUIBlockRenderer,
    type GenUIBlockRendererProps,
    type GenUIMapPoint,
} from '@asteby/metacore-genui'
import { AreaPanel, StatusBadge } from './area-panel'
import { Avatar, isBranded } from './avatar'
import { useMap } from './context'
import { makeTerms, regionName } from './field-labels'
import type { AreaSelection } from './layers'
import { pointColor } from './geometry'
import { MapView } from './map-view'
import { PALETTE, colorFor } from './palette'
import { useMapLabels } from './renderers/shared'
import type { MapPointItem } from './types'

type Tone = NonNullable<GenUIMapPoint['tone']>

/** Tone -> colour (Okabe-Ito hues; the legend and the list print the text too, colour is never the only channel). */
export const TONE_COLORS: Record<Tone, string> = {
    default: PALETTE[0],
    muted: '#6B7280',
    info: '#56B4E9',
    success: '#009E73',
    warning: '#E69F00',
    danger: '#D55E00',
}

const HEIGHTS = { sm: 240, md: 360, lg: 520 } as const

/** Shows the label of the hovered point: DOM markers (by their aria-label) and the clustered layer. */
function HoverTooltip({ points }: { points: MapPointItem[] }) {
    const { map, ml } = useMap()
    const latest = React.useRef(points)
    latest.current = points
    React.useEffect(() => {
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 18, className: 'mcm-hover-tooltip' })
        const show = (p: MapPointItem) => {
            const host = document.createElement('div')
            host.textContent = [p.label, p.statusLabel ?? p.status].filter(Boolean).join(' · ')
            popup.setLngLat([p.lng, p.lat]).setDOMContent(host).addTo(map)
        }
        const container = map.getContainer?.()
        const over = (e: Event) => {
            const btn = (e.target as HTMLElement | null)?.closest?.('button.mcm-marker')
            const name = btn?.getAttribute('aria-label')
            if (!name) return
            const p = latest.current.find((x) => name === (x.statusLabel ?? x.status ? `${x.label}, ${x.statusLabel ?? x.status}` : x.label))
            if (p) show(p)
        }
        const out = () => popup.remove()
        container?.addEventListener('mouseover', over)
        container?.addEventListener('mouseout', out)
        const layer = 'mcm-points-points'
        const onLayer = (e: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
            const p = latest.current.find((x) => x.key === e.features?.[0]?.properties?.key)
            if (p) show(p)
        }
        map.on('mousemove', layer, onLayer as never)
        map.on('mouseleave', layer, out)
        return () => {
            container?.removeEventListener('mouseover', over)
            container?.removeEventListener('mouseout', out)
            map.off('mousemove', layer, onLayer as never)
            map.off('mouseleave', layer, out)
            popup.remove()
        }
    }, [map, ml])
    return null
}

/** The `map` block renderer. */
export function GenUIMapBlock({ block, rows, text, navigate, act, locale }: GenUIBlockRendererProps) {
    const labels = useMapLabels()
    const [selected, setSelected] = React.useState<string | null>(null)
    /** The area bubble whose members the side panel lists (country / city precision: they share a centroid). */
    const [area, setArea] = React.useState<{ gid: string; name: string; keys: string[] } | null>(null)
    const groupBy: 'status' | 'group' = block.group_by === 'group' ? 'group' : 'status'
    const raw = React.useMemo(() => normalizeMapPoints(block, rows, text), [block, rows, text])
    const terms = makeTerms(block as { field_labels?: unknown; status_labels?: unknown }, text)
    const panel = !!block.detail_panel

    const { items, colors } = React.useMemo(() => {
        const colors: Record<string, string> = {}
        const items: MapPointItem[] = raw.map((p) => {
            // The colour key is the grouping value; tone colours win, else a stable palette hue.
            const group = (groupBy === 'group' ? p.group : p.status) ?? '—'
            colors[group] ??= p.tone ? TONE_COLORS[p.tone] : colorFor(group)
            // What the title, subtitle and status already say is not repeated as a detail row.
            const said = new Set([p.label, p.subtitle, p.status, p.group].filter(Boolean))
            const details = p.details.filter((d) => !said.has(d.value)).map((d) => ({ ...d, label: d.field ? terms.field(d.field) : d.label }))
            return { key: p.key, lat: p.lat, lng: p.lng, label: p.label, status: group, statusLabel: groupBy === 'status' ? terms.status(group) : group, precision: p.precision, area: p.area, image: p.image, accent: p.accent, subtitle: p.subtitle, details }
        })
        return { items, colors }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw, groupBy, block.field_labels, block.status_labels, text])

    const legend = React.useMemo(() => mapLegend(raw, groupBy), [raw, groupBy])
    const chosen = selected ? items.find((p) => p.key === selected) : undefined
    const areaMembers = area ? items.filter((p) => area.keys.includes(p.key)) : []
    const showArea = panel && area !== null && areaMembers.length > 0 && !chosen
    const pick = (item: MapPointItem) => {
        setSelected(item.key)
        const action = block.on_select as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
        if (action) {
            if (action.do === 'navigate' && typeof action.route?.path === 'string' && !action.confirm) navigate(action.route.path)
            else act({ action, blockId: block.id, context: { point: raw.find((p) => p.key === item.key) } })
        }
    }
    const openArea = (a: AreaSelection) => {
        setSelected(null)
        setArea({ gid: a.gid, name: a.area ? regionName(a.area, locale) : labels.zone, keys: a.members.map((m) => m.key) })
    }
    const statusOf = (p: MapPointItem) => p.statusLabel ?? p.status

    const loading = block.source && rows === undefined
    const panelOpen = panel && (!!chosen || showArea)
    return (
        <section aria-label={block.summary} className="mcm-genui-map" data-genui-block="map" style={{ display: 'grid', gap: 8 }}>
            {block.title ? <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground, #6b7280)' }}>{text(block.title)}</p> : null}
            {loading ? (
                <div aria-busy="true" role="status" aria-label={labels.loading} style={{ height: HEIGHTS[block.height as keyof typeof HEIGHTS] ?? HEIGHTS.md }} />
            ) : (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: panelOpen ? 'minmax(0,1fr) minmax(12rem,18rem)' : 'minmax(0,1fr)' }}>
                    <MapView
                        points={items}
                        cluster={block.cluster === undefined ? undefined : !!block.cluster}
                        colors={colors}
                        height={HEIGHTS[block.height as keyof typeof HEIGHTS] ?? HEIGHTS.md}
                        labels={labels}
                        locale={locale}
                        ariaLabel={block.summary}
                        selectedKey={selected}
                        onSelect={pick}
                        onArea={panel ? openArea : undefined}
                        popupDetails={!panel}
                    >
                        {block.tooltip !== false ? <HoverTooltip points={items} /> : null}
                    </MapView>
                    {showArea && area ? (
                        <AreaPanel
                            title={area.name}
                            count={labels.clusterCount.replace('{n}', String(areaMembers.length))}
                            members={areaMembers}
                            colors={colors}
                            listLabel={labels.list}
                            closeLabel={labels.closeDetail}
                            selectedKey={selected}
                            onPick={pick}
                            onClose={() => setArea(null)}
                        />
                    ) : null}
                    {panel && chosen ? (
                        <aside aria-label={chosen.label} data-testid="map-detail-panel" style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 10, fontSize: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {isBranded(chosen) ? <Avatar label={chosen.label} image={chosen.image} accent={chosen.accent} ring={pointColor(chosen, colors)} size={44} decorative /> : null}
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ margin: 0, fontWeight: 600 }}>{chosen.label}</p>
                                    {chosen.subtitle ? <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>{chosen.subtitle}</p> : null}
                                </div>
                            </div>
                            {statusOf(chosen) ? (
                                <p style={{ margin: '6px 0' }}>
                                    <StatusBadge text={statusOf(chosen) as string} color={pointColor(chosen, colors)} />
                                </p>
                            ) : null}
                            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
                                {(chosen.details ?? []).map((d, i) => (
                                    <React.Fragment key={i}>
                                        <dt style={{ color: 'var(--muted-foreground, #6b7280)' }}>{d.label ?? ''}</dt>
                                        <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{d.value}</dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                {area?.keys.includes(chosen.key) ? (
                                    <button type="button" onClick={() => setSelected(null)}>
                                        {labels.backToList}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelected(null)
                                        setArea(null)
                                    }}
                                >
                                    {labels.closeDetail}
                                </button>
                            </div>
                        </aside>
                    ) : null}
                </div>
            )}
            {block.legend !== false && legend.length > 0 ? (
                <ul aria-label={groupBy === 'group' ? labels.legendByGroup : labels.legendByStatus} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
                    {legend.map((l) => (
                        <li key={l.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: colors[l.value] ?? colorFor(l.value) }} />
                            {groupBy === 'status' ? terms.status(l.value) : l.value} · {l.count}
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    )
}

/** Registers the `map` block of genui/v2. Returns a function that restores the previous renderer. */
export function registerGenUIMapBlock(): () => void {
    return registerGenUIBlockRenderer('map', GenUIMapBlock)
}
