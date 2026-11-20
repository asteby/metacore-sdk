// Detail panel of an area bubble (country / city precision): the members that share the centroid, as a list the user
// can walk with the keyboard. Pure presentation over `MapPointItem`s: texts arrive translated.
import * as React from 'react'
import { Avatar, isBranded } from './avatar'
import { pointColor } from './geometry'
import { readableOn, safeColor } from './palette'
import type { MapPointItem } from './types'

/**
 * The list takes all the height the panel gives it (flex child, no fixed max-height) and scrolls only when the rows do
 * not fit. Scroll shadows (local/scroll background pairs) show there is more on either edge; rows snap to the top
 * and the bottom padding keeps the last visible row from being cut in half.
 */
const SHADE = 'var(--card, var(--background, Canvas))'
export const LIST_SCROLL: React.CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollSnapType: 'y proximity',
    scrollPaddingBlock: 4,
    paddingBottom: 4,
    background: `linear-gradient(${SHADE} 30%, transparent) top / 100% 24px no-repeat local, linear-gradient(transparent, ${SHADE} 70%) bottom / 100% 24px no-repeat local, radial-gradient(farthest-side at 50% 0, rgba(0,0,0,.28), transparent) top / 100% 8px no-repeat scroll, radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,.28), transparent) bottom / 100% 8px no-repeat scroll`,
}

const MUTED = 'var(--muted-foreground, #6b7280)'

/**
 * Button of a map panel. Hosts reset native button chrome (Tailwind preflight), which leaves a bare label that does not
 * read as clickable; this one carries its own border, padding, hover-safe tokens and a focus ring via `outline`.
 */
export const PANEL_BUTTON: React.CSSProperties = {
    font: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
    color: 'var(--foreground, inherit)',
    background: 'var(--secondary, rgba(127,127,127,.14))',
    border: '1px solid var(--border, rgba(127,127,127,.4))',
    borderRadius: 6,
    padding: '5px 12px',
    cursor: 'pointer',
}

export function PanelButton({ style, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
    return <button type="button" {...rest} style={{ ...PANEL_BUTTON, ...style }} />
}

/** Status pill: the text plus its tone (colour is never the only channel). */
export function StatusBadge({ text, color }: { text: string; color?: string }): React.ReactElement {
    const bg = safeColor(color)
    return (
        <span style={{ display: 'inline-block', borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 600, lineHeight: 1.5, background: bg ?? 'rgba(127,127,127,.25)', color: bg ? readableOn(bg) : 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {text}
        </span>
    )
}

export interface AreaPanelProps {
    /** Name of the area (already translated / localised). */
    title: string
    /** Count line under the title (e.g. `8 instancias`). */
    count: string
    members: MapPointItem[]
    colors?: Record<string, string>
    /** Accessible name of the list. */
    listLabel: string
    closeLabel: string
    selectedKey?: string | null
    onPick: (item: MapPointItem) => void
    onClose: () => void
    /** Extra style of the panel (e.g. `contain: 'size'` so a grid row is as tall as the map, not the list). */
    style?: React.CSSProperties
}

/**
 * Members of one area: avatar or logo, title, subtitle and the translated status as a toned badge. The list scrolls
 * inside the panel; Up / Down / Home / End move between members, Enter opens one, Esc closes the panel.
 */
export function AreaPanel({ title, count, members, colors, listLabel, closeLabel, selectedKey, onPick, onClose, style }: AreaPanelProps): React.ReactElement {
    const list = React.useRef<HTMLUListElement | null>(null)
    const avatars = members.some(isBranded)
    React.useEffect(() => {
        list.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    }, [title])
    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation()
            return onClose()
        }
        const btns = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null
        if (to === null || i < 0) return
        e.preventDefault()
        btns[Math.max(0, Math.min(btns.length - 1, to))]?.focus()
    }
    return (
        <aside aria-label={title} onKeyDown={onKey} data-testid="map-area-panel" style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 10, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, minWidth: 0, boxSizing: 'border-box', overflow: 'hidden', ...style }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{count}</p>
                </div>
                <PanelButton onClick={onClose} aria-label={closeLabel} title={closeLabel} style={{ fontSize: 16, lineHeight: 1, padding: '2px 9px' }}>
                    ×
                </PanelButton>
            </div>
            <ul ref={list} aria-label={listLabel} style={{ listStyle: 'none', margin: 0, padding: 0, ...LIST_SCROLL, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 2 }}>
                {members.map((m) => {
                    const status = m.statusLabel ?? m.status
                    return (
                        <li key={m.key} style={{ scrollSnapAlign: 'start' }}>
                            <button
                                type="button"
                                aria-current={selectedKey === m.key || undefined}
                                aria-label={status ? `${m.label}, ${status}` : m.label}
                                onClick={() => onPick(m)}
                                style={{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: selectedKey === m.key ? 'rgba(127,127,127,.2)' : 'none', border: 0, borderRadius: 6, padding: '5px 6px', cursor: 'pointer' }}
                            >
                                {avatars ? <Avatar label={m.label} image={m.image} accent={m.accent} ring={pointColor(m, colors)} size={32} decorative /> : null}
                                <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                                    {m.subtitle ? <span style={{ display: 'block', fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subtitle}</span> : null}
                                </span>
                                {status ? <StatusBadge text={status} color={pointColor(m, colors)} /> : null}
                            </button>
                        </li>
                    )
                })}
            </ul>
        </aside>
    )
}
