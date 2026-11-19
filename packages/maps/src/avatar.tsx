// Avatar of a map point (logo / photo of a store, branch, vehicle, instance…).
// One implementation for DOM markers, popups, the fan and React lists:
// `avatarNode` builds it, `<Avatar>` mounts it.
//
// Image rules (the URL is data from a row, never trusted):
//  - only `https:` URLs or same-origin paths (`/…`) are loaded; `http:`,
//    `data:`, `javascript:` and protocol-relative URLs are dropped (no mixed
//    content, no script URLs, a CSP `img-src` of 'self' + https keeps working);
//  - the <img> is display-only, so it is NOT loaded with `crossOrigin` (that
//    would make a logo from a CDN without CORS headers fail for no benefit; it
//    would only matter if it were drawn to a canvas, which this never does);
//  - `referrerPolicy="no-referrer"` (the logo host learns nothing about the app),
//    `loading="lazy"`, `decoding="async"` and explicit width/height (no layout shift);
//  - on a failed load the image is removed and the initials show, tinted with the
//    brand colour (`accent`) or a neutral grey.
import * as React from 'react'
import { readableOn, safeColor } from './palette'

/** Neutral background of initials without a brand colour (white text: contrast 7.5:1). */
export const NEUTRAL_AVATAR = '#4B5563'

const MAX_URL = 2048
const SENTINEL = 'https://same-origin.invalid'

/** A path on this origin: starts with one slash and the URL parser keeps it on the same host (so `//host`, backslash and control-character tricks all fail). */
function isSameOriginPath(s: string): boolean {
    if (!s.startsWith('/')) return false
    try {
        return new URL(s, SENTINEL).origin === SENTINEL
    } catch {
        return false
    }
}

/** The URL when it is safe to load as an avatar (https or same-origin path), else undefined. */
export function safeImageUrl(u: unknown): string | undefined {
    if (typeof u !== 'string') return undefined
    const s = u.trim()
    if (!s || s.length > MAX_URL) return undefined
    if (isSameOriginPath(s)) return s
    try {
        const url = new URL(s)
        return url.protocol === 'https:' && !url.username && !url.password ? s : undefined
    } catch {
        return undefined
    }
}

/** Up to two initials of a name ("Café Norte" → "CN"); empty when it has no letters or digits. */
export function initialsOf(label: string): string {
    const words = label.match(/[\p{L}\p{N}]+/gu) ?? []
    const first = words[0] ?? ''
    if (words.length === 1) return [...first].slice(0, 2).join('').toUpperCase()
    return words
        .slice(0, 2)
        .map((w) => [...w][0] ?? '')
        .join('')
        .toUpperCase()
}

export interface AvatarSpec {
    /** Accessible name; initials derive from it. */
    label: string
    image?: string
    /** Brand colour (hex / rgb / hsl): tints the initials background. */
    accent?: string
    /** Presence / status colour of the ring. */
    ring?: string
    /** Outer diameter in px (default 32). */
    size?: number
    /** Inside a control that already has an accessible name: hide the avatar from assistive tech. */
    decorative?: boolean
}

/** A point is branded when it carries a logo or a brand colour: only then are avatars drawn. */
export const isBranded = (p: { image?: string; accent?: string }): boolean => !!(safeImageUrl(p.image) || safeColor(p.accent))

export function avatarNode({ label, image, accent, ring, size = 32, decorative = false }: AvatarSpec): HTMLElement {
    const root = document.createElement('span')
    root.className = 'mcm-avatar'
    root.style.width = root.style.height = `${size}px`
    root.style.fontSize = `${Math.max(9, Math.round(size * 0.38))}px`
    const bg = safeColor(accent) ?? NEUTRAL_AVATAR
    root.style.background = bg
    root.style.color = readableOn(bg)
    const r = safeColor(ring)
    if (r) root.style.borderColor = r
    if (decorative) root.setAttribute('aria-hidden', 'true')
    else {
        root.setAttribute('role', 'img')
        root.setAttribute('aria-label', label)
    }
    root.textContent = initialsOf(label)
    const src = safeImageUrl(image)
    if (src) {
        const img = document.createElement('img')
        img.className = 'mcm-avatar-img'
        img.alt = ''
        img.width = img.height = size
        img.loading = 'lazy'
        img.decoding = 'async'
        img.referrerPolicy = 'no-referrer'
        img.draggable = false
        img.addEventListener('error', () => img.remove())
        img.src = src
        root.appendChild(img)
    }
    return root
}

/** React wrapper of `avatarNode`. */
export function Avatar(props: AvatarSpec & { className?: string }): React.ReactElement {
    const host = React.useRef<HTMLSpanElement | null>(null)
    const { label, image, accent, ring, size, decorative, className } = props
    React.useLayoutEffect(() => {
        const el = host.current
        if (!el) return
        const node = avatarNode({ label, image, accent, ring, size, decorative })
        el.replaceChildren(node)
        return () => node.remove()
    }, [label, image, accent, ring, size, decorative])
    return <span ref={host} className={className} style={{ display: 'inline-flex', flexShrink: 0 }} />
}
