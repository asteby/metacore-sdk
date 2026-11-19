// Small DOM helpers: marker/popup styling without a CSS file (the package
// ships no stylesheet; the host's MapLibre CSS is injected with the chunk).
import { avatarNode, initialsOf, isBranded } from './avatar'
import { readableOn, safeColor } from './palette'

export { readableOn }

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
.mcm-avatar{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border-radius:50%;border:3px solid #fff;font-family:system-ui,sans-serif;font-weight:700;line-height:1;letter-spacing:.02em;user-select:none;box-shadow:0 0 0 1.5px rgba(17,24,39,.55),0 1px 5px rgba(0,0,0,.45)}
.mcm-avatar-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;border-radius:50%}
.mcm-marker--avatar{width:auto;height:auto;border:0;background:none!important;box-shadow:none;padding:0;border-radius:50%}
.mcm-marker--avatar:focus-visible{outline:3px solid #111;outline-offset:3px;box-shadow:0 0 0 6px #fff}
.mcm-mosaic{display:inline-flex;align-items:center;border:0;background:none;padding:0;cursor:pointer;border-radius:999px}
.mcm-mosaic:focus-visible{outline:3px solid #111;outline-offset:3px;box-shadow:0 0 0 6px #fff}
.mcm-mosaic .mcm-avatar+.mcm-avatar{margin-left:-12px}
.mcm-mosaic-n{margin-left:4px;min-width:22px;padding:2px 7px;border-radius:999px;background:#111827;color:#fff;border:2px solid #fff;font:700 12px/1.3 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.mcm-head{display:flex;align-items:center;gap:10px;margin:0 22px 4px 0}
.mcm-head-text{min-width:0}
.mcm-head strong{margin:0}
.mcm-sub{display:block;font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcm-spider-pin.mcm-has-avatar{width:38px;height:38px;margin:-19px 0 0 -19px;padding:0;background:none!important;border:0;box-shadow:none;border-radius:50%}
.mcm-root.mcm-dark .maplibregl-ctrl-group{background:#2a3040}
.mcm-root.mcm-dark .maplibregl-ctrl-group button+button{border-top-color:#4a5163}
.mcm-root.mcm-dark .maplibregl-ctrl button .maplibregl-ctrl-icon{filter:invert(1)}
.mcm-root .maplibregl-ctrl.maplibregl-ctrl-attrib,.mcm-root .maplibregl-ctrl.maplibregl-ctrl-attrib.maplibregl-compact,.mcm-root .maplibregl-ctrl.maplibregl-ctrl-attrib.maplibregl-compact-show{background:rgba(255,255,255,.88);color:#1f2937}
.mcm-root .maplibregl-ctrl-attrib a,.mcm-root .maplibregl-ctrl-attrib a:visited{color:#1d4ed8}
.mcm-root.mcm-dark .maplibregl-ctrl.maplibregl-ctrl-attrib,.mcm-root.mcm-dark .maplibregl-ctrl.maplibregl-ctrl-attrib.maplibregl-compact,.mcm-root.mcm-dark .maplibregl-ctrl.maplibregl-ctrl-attrib.maplibregl-compact-show{background:rgba(24,28,38,.88);color:#e2e8f0}
.mcm-root.mcm-dark .maplibregl-ctrl-attrib a,.mcm-root.mcm-dark .maplibregl-ctrl-attrib a:visited{color:#93c5fd}
.mcm-root.mcm-dark .maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button{background-color:transparent;filter:invert(1)}
.mcm-dark .maplibregl-popup-content{background:#1f2430;color:#e8eaed}
.mcm-dark .maplibregl-popup-tip{border-top-color:#1f2430;border-bottom-color:#1f2430}
.mcm-dark .maplibregl-popup-close-button{color:#e8eaed}
.mcm-tooltip{pointer-events:none}
.mcm-tooltip .maplibregl-popup-content{padding:6px 10px}
.mcm-list{display:block;margin:6px 0 0;padding:0;list-style:none;max-height:14rem;overflow-y:auto;overscroll-behavior:contain}
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

/** Branding of a point in a popup header or list row. */
export interface PointBrand {
    image?: string
    accent?: string
    /** Status / presence colour of the avatar ring. */
    ring?: string
}

function subtitleNode(text: string): HTMLElement {
    const s = document.createElement('small')
    s.className = 'mcm-sub'
    s.textContent = text
    return s
}

/**
 * Popup body as DOM text nodes (labels/values come from data: never innerHTML). Rows with a label align as key / value;
 * `chip` is the status pill under the title. With `brand` (a logo or a brand colour) the title gets an avatar on its left;
 * `subtitle` goes under the name.
 */
export function popupNode(title: string, rows: Array<{ label?: string; value: string }> = [], chip?: { text: string; color?: string }, brand?: PointBrand, subtitle?: string): HTMLElement {
    const root = document.createElement('div')
    root.className = 'mcm-popup'
    const t = document.createElement('strong')
    t.textContent = title
    if (brand && isBranded(brand)) {
        const head = document.createElement('div')
        head.className = 'mcm-head'
        head.appendChild(avatarNode({ label: title, ...brand, size: 40 }))
        const text = document.createElement('div')
        text.className = 'mcm-head-text'
        text.appendChild(t)
        if (subtitle) text.appendChild(subtitleNode(subtitle))
        head.appendChild(text)
        root.appendChild(head)
    } else {
        root.appendChild(t)
        if (subtitle) root.appendChild(subtitleNode(subtitle))
    }
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
export function listNode(title: string, items: Array<{ label: string; status?: string; color?: string; image?: string; accent?: string; onPick: () => void }>, more?: string): HTMLElement {
    const root = popupNode(title)
    const ul = document.createElement('ul')
    ul.className = 'mcm-list'
    for (const it of items) {
        const li = document.createElement('li')
        const b = document.createElement('button')
        b.type = 'button'
        b.setAttribute('aria-label', it.status ? `${it.label}, ${it.status}` : it.label)
        if (isBranded(it)) b.appendChild(avatarNode({ label: it.label, image: it.image, accent: it.accent, ring: it.color, size: 28, decorative: true }))
        const name = document.createElement('span')
        name.className = 'mcm-li-name'
        name.style.flex = '1'
        name.textContent = it.label
        b.appendChild(name)
        if (it.status) b.appendChild(chipNode(it.status, it.color))
        b.addEventListener('click', it.onPick)
        li.appendChild(b)
        ul.appendChild(li)
    }
    // Arrow keys move between members (Tab still reaches each one: the list is not a trap).
    ul.addEventListener('keydown', (e) => {
        const btns = [...ul.querySelectorAll<HTMLButtonElement>('button')]
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null
        if (to === null || i < 0) return
        e.preventDefault()
        btns[Math.max(0, Math.min(btns.length - 1, to))]?.focus()
    })
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
    /** Logo and brand colour: the pin shows an avatar (logo, else initials) instead of its number. */
    image?: string
    accent?: string
    onPick: () => void
}

/**
 * Spiderfy body: a zero-size anchor holding one leader line and one numbered pin
 * per member at the given pixel offsets. Pins are buttons named `label, status`.
 */
export function spiderNode(pins: SpiderPin[], offsets: Array<[number, number]>): { root: HTMLElement; pins: HTMLButtonElement[] } {
    // Avatars when anyone in the fan is branded (logos, or initials for the rest); plain numbers otherwise.
    const avatars = pins.some(isBranded)
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
        if (avatars && initialsOf(p.label)) {
            b.classList.add('mcm-has-avatar')
            b.appendChild(avatarNode({ label: p.label, image: p.image, accent: p.accent, ring: p.color, size: 36, decorative: true }))
        } else b.textContent = String(i + 1)
        b.dataset.label = p.status ? `${p.label} · ${p.status}` : p.label
        b.setAttribute('aria-label', p.status ? `${p.label}, ${p.status}` : p.label)
        b.style.left = `${dx}px`
        b.style.top = `${dy}px`
        const c = safeColor(p.color)
        if (c && !b.classList.contains('mcm-has-avatar')) {
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
