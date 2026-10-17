// Small DOM helpers: marker/popup styling without a CSS file (the package
// ships no stylesheet; the host's MapLibre CSS is injected with the chunk).
const STYLE_ID = 'metacore-maps-style'

const CSS = `
.mcm-marker{box-sizing:border-box;width:28px;height:28px;border-radius:50%;border:2px solid #fff;color:#fff;font:600 12px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.mcm-marker:focus-visible{outline:3px solid #111;outline-offset:2px;box-shadow:0 0 0 5px #fff}
.mcm-marker[aria-pressed="true"]{transform:scale(1.2)}
.mcm-popup{font:13px/1.4 system-ui,sans-serif;max-width:240px}
.mcm-popup strong{display:block}
.mcm-popup span{display:block;color:inherit;opacity:.8}
.mcm-dark .maplibregl-popup-content{background:#1f2430;color:#e8eaed}
.mcm-dark .maplibregl-popup-tip{border-top-color:#1f2430;border-bottom-color:#1f2430}
.mcm-dark .maplibregl-popup-close-button{color:#e8eaed}
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

/** Popup body as DOM text nodes (labels/values come from data: never innerHTML). */
export function popupNode(title: string, rows: Array<{ label?: string; value: string }> = []): HTMLElement {
    const root = document.createElement('div')
    root.className = 'mcm-popup'
    const t = document.createElement('strong')
    t.textContent = title
    root.appendChild(t)
    for (const r of rows) {
        if (!r.value) continue
        const s = document.createElement('span')
        s.textContent = r.label ? `${r.label}: ${r.value}` : r.value
        root.appendChild(s)
    }
    return root
}

/** "Open in map" link (OpenStreetMap; no key, no tracking script). */
export function openInMapHref(lat: number, lng: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
}
