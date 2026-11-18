// Small DOM helpers: marker/popup styling without a CSS file (the package
// ships no stylesheet; the host's MapLibre CSS is injected with the chunk).
import { safeColor } from './palette'

const STYLE_ID = 'metacore-maps-style'

const CSS = `
.mcm-marker{box-sizing:border-box;width:28px;height:28px;border-radius:50%;border:2px solid #fff;color:#fff;font:600 12px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.mcm-marker:focus-visible{outline:3px solid #111;outline-offset:2px;box-shadow:0 0 0 5px #fff}
.mcm-marker[aria-pressed="true"]{transform:scale(1.2)}
.mcm-popup{font:13px/1.45 system-ui,sans-serif;min-width:150px;max-width:280px;overflow-wrap:anywhere}
.mcm-popup strong{display:block;font-size:14px;margin:0 22px 4px 0}
.mcm-chip{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;line-height:1.5;background:rgba(127,127,127,.25);color:inherit}
.mcm-rows{display:grid;gap:2px;margin-top:6px}
.mcm-row{display:grid;grid-template-columns:minmax(60px,auto) 1fr;gap:10px}
.mcm-k{opacity:.7}
.mcm-v{text-align:left}
.mcm-full{grid-column:1/-1}
.maplibregl-popup-content{box-shadow:0 4px 18px rgba(0,0,0,.28);border-radius:10px;padding:12px 14px}
.maplibregl-popup-close-button{width:28px;height:28px;font-size:20px;line-height:1;color:inherit;opacity:.8;border-radius:0 10px 0 6px}
.maplibregl-popup-close-button:hover,.maplibregl-popup-close-button:focus-visible{opacity:1;background:rgba(127,127,127,.25)}
.mcm-spider{position:relative;width:0;height:0}
.mcm-spider-hub{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #111}
.mcm-spider-leg{position:absolute;left:0;top:0;height:2px;margin-top:-1px;transform-origin:0 50%;background:rgba(17,24,39,.65);box-shadow:0 0 0 1px rgba(255,255,255,.7)}
.mcm-spider-pin{position:absolute;box-sizing:border-box;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:2px solid #fff;background:#0072B2;color:#fff;font:600 12px/1 system-ui,sans-serif;cursor:pointer;padding:0;box-shadow:0 1px 5px rgba(0,0,0,.5)}
.mcm-spider-pin::after{content:attr(data-label);display:none;position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;padding:3px 8px;border-radius:6px;background:#111;color:#fff;font-weight:500;pointer-events:none}
.mcm-spider-pin:hover::after,.mcm-spider-pin:focus-visible::after{display:block}
.mcm-spider-pin:hover,.mcm-spider-pin:focus-visible{z-index:2}
.mcm-spider-pin:focus-visible{outline:3px solid #111;outline-offset:2px;box-shadow:0 0 0 5px #fff}
.mcm-dark .maplibregl-ctrl-group{background:#2a3040}
.mcm-dark .maplibregl-ctrl-group button+button{border-top-color:#4a5163}
.mcm-dark .maplibregl-ctrl button .maplibregl-ctrl-icon{filter:invert(1)}
.mcm-dark .maplibregl-ctrl-attrib{background:rgba(31,36,48,.8);color:#cbd5e1}
.mcm-dark .maplibregl-ctrl-attrib a{color:#e8eaed}
.mcm-dark .maplibregl-popup-content{background:#1f2430;color:#e8eaed}
.mcm-dark .maplibregl-popup-tip{border-top-color:#1f2430;border-bottom-color:#1f2430}
.mcm-dark .maplibregl-popup-close-button{color:#e8eaed}
.mcm-tooltip{pointer-events:none}
.mcm-tooltip .maplibregl-popup-content{padding:6px 10px}
.mcm-list{display:block;margin:6px 0 0;padding:0;list-style:none}
.mcm-list button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-radius:4px;padding:5px 6px;cursor:pointer}
.mcm-li-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcm-list button:hover,.mcm-list button:focus-visible{background:rgba(127,127,127,.2);outline:2px solid currentColor}
.mcm-list em{display:block;font-style:normal;opacity:.8;padding:2px 6px}
@media (prefers-reduced-motion:reduce){.mcm-marker{transition:none}}
`

export function ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = CSS
    document.head.appendChild(el)
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string): string {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return '#fff'
    let h = m[1] as string
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    const ch = [0, 2, 4].map((i) => {
        const v = parseInt(h.slice(i, i + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    const l = 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number)
    return l > 0.4 ? '#111' : '#fff'
}

/** Status pill: text plus the status colour (the text stays, colour is never the only channel). */
export function chipNode(text: string, color?: string): HTMLElement {
    const c = document.createElement('span')
    c.className = 'mcm-chip'
    c.textContent = text
    const safe = safeColor(color)
    if (safe) {
        c.style.background = safe
        c.style.color = readableOn(safe)
    }
    return c
}

/** Popup body as DOM text nodes (labels/values come from data: never innerHTML). Rows with a label align as key / value; `chip` is the status pill under the title. */
export function popupNode(title: string, rows: Array<{ label?: string; value: string }> = [], chip?: { text: string; color?: string }): HTMLElement {
    const root = document.createElement('div')
    root.className = 'mcm-popup'
    const t = document.createElement('strong')
    t.textContent = title
    root.appendChild(t)
    if (chip?.text) root.appendChild(chipNode(chip.text, chip.color))
    const body = document.createElement('div')
    body.className = 'mcm-rows'
    for (const r of rows) {
        if (!r.value) continue
        const row = document.createElement('div')
        row.className = 'mcm-row'
        if (r.label) {
            const k = document.createElement('span')
            k.className = 'mcm-k'
            k.textContent = r.label
            row.appendChild(k)
        }
        const v = document.createElement('span')
        v.className = r.label ? 'mcm-v' : 'mcm-v mcm-full'
        v.textContent = r.value
        row.appendChild(v)
        body.appendChild(row)
    }
    if (body.childNodes.length) root.appendChild(body)
    return root
}

/** Hover tooltip body: the popup text, flagged as a tooltip (it never replaces the click popup). */
export function tooltipNode(title: string, status?: string): HTMLElement {
    const n = popupNode(title, [{ value: status ?? '' }])
    n.setAttribute('role', 'tooltip')
    return n
}

/** Popup listing members as buttons with their status pill (data goes in as text). `more` is the overflow row, if any. */
export function listNode(title: string, items: Array<{ label: string; status?: string; color?: string; onPick: () => void }>, more?: string): HTMLElement {
    const root = popupNode(title)
    const ul = document.createElement('ul')
    ul.className = 'mcm-list'
    for (const it of items) {
        const li = document.createElement('li')
        const b = document.createElement('button')
        b.type = 'button'
        b.setAttribute('aria-label', it.status ? `${it.label}, ${it.status}` : it.label)
        const name = document.createElement('span')
        name.className = 'mcm-li-name'
        name.textContent = it.label
        b.appendChild(name)
        if (it.status) b.appendChild(chipNode(it.status, it.color))
        b.addEventListener('click', it.onPick)
        li.appendChild(b)
        ul.appendChild(li)
    }
    if (more) {
        const li = document.createElement('li')
        const em = document.createElement('em')
        em.textContent = more
        li.appendChild(em)
        ul.appendChild(li)
    }
    root.appendChild(ul)
    return root
}

export interface SpiderPin {
    label: string
    status?: string
    color?: string
    onPick: () => void
}

/**
 * Spiderfy body: a zero-size anchor holding one leader line and one numbered pin
 * per member at the given pixel offsets. Pins are buttons named `label, status`.
 */
export function spiderNode(pins: SpiderPin[], offsets: Array<[number, number]>): { root: HTMLElement; pins: HTMLButtonElement[] } {
    const root = document.createElement('div')
    root.className = 'mcm-spider'
    root.setAttribute('role', 'group')
    const hub = document.createElement('i')
    hub.className = 'mcm-spider-hub'
    root.appendChild(hub)
    const buttons = pins.map((p, i) => {
        const [dx, dy] = offsets[i] ?? [0, 0]
        const leg = document.createElement('i')
        leg.className = 'mcm-spider-leg'
        leg.style.width = `${Math.hypot(dx, dy)}px`
        leg.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
        root.appendChild(leg)
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'mcm-spider-pin'
        b.textContent = String(i + 1)
        b.dataset.label = p.status ? `${p.label} · ${p.status}` : p.label
        b.setAttribute('aria-label', p.status ? `${p.label}, ${p.status}` : p.label)
        b.style.left = `${dx}px`
        b.style.top = `${dy}px`
        const c = safeColor(p.color)
        if (c) {
            b.style.background = c
            b.style.color = readableOn(c)
        }
        b.addEventListener('click', (e) => {
            e.stopPropagation()
            p.onPick()
        })
        root.appendChild(b)
        return b
    })
    return { root, pins: buttons }
}

/** "Open in map" link (OpenStreetMap; no key, no tracking script). */
export function openInMapHref(lat: number, lng: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
}
