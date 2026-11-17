import { useEffect } from 'react'
import { formatTabTitle, stripTabTitleCount, type Severity } from '@asteby/metacore-ui/layout'

const TONE_COLOR: Record<Severity, string> = { info: '#0ea5e9', attention: '#f59e0b', urgent: '#f97316', critical: '#dc2626' }

/**
 * Stamps the aggregate counter on the browser tab: "(99+) Title" plus a toned
 * dot over the favicon. Idempotent, restores on unmount/zero, SSR-safe and
 * best-effort for the favicon (canvas/CORS failures are swallowed).
 */
export function useDocumentAttention(count: number, tone: Severity, opts: { favicon?: boolean } = {}) {
    const { favicon = true } = opts
    useEffect(() => {
        if (typeof document === 'undefined') return
        const base = stripTabTitleCount(document.title)
        document.title = formatTabTitle(base, count)
        return () => {
            document.title = stripTabTitleCount(document.title)
        }
    }, [count])

    useEffect(() => {
        if (!favicon || typeof document === 'undefined') return
        const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
        if (!link) return
        const original = link.dataset.mcOriginalHref ?? link.href
        link.dataset.mcOriginalHref = original
        if (count <= 0) {
            link.href = original
            return
        }
        let cancelled = false
        try {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                if (cancelled) return
                try {
                    const c = document.createElement('canvas')
                    c.width = c.height = 32
                    const ctx = c.getContext('2d')
                    if (!ctx) return
                    ctx.drawImage(img, 0, 0, 32, 32)
                    ctx.fillStyle = TONE_COLOR[tone]
                    ctx.beginPath()
                    ctx.arc(24, 8, 8, 0, Math.PI * 2)
                    ctx.fill()
                    link.href = c.toDataURL('image/png')
                } catch {
                    /* tainted canvas: keep the original icon */
                }
            }
            img.src = original
        } catch {
            /* ignore */
        }
        return () => {
            cancelled = true
            link.href = original
        }
    }, [count, tone, favicon])
}
