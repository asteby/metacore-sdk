/**
 * Lleva la marca del contexto al documento: `document.title`, el favicon y las
 * variables CSS `--brand-primary` / `--brand-accent` en `<html>`.
 *
 * Genérico: con la marca vacía no toca nada (se queda el título y el favicon
 * que trae el `index.html` del host). Nunca escribe un nombre de respaldo.
 */
import { useEffect } from 'react'
import { useBrand } from './context'

/** Variables CSS que pinta `BrandDocumentSync` con los colores crudos de la marca. */
export const BRAND_CSS_VARS = {
    primary: '--brand-primary',
    accent: '--brand-accent',
} as const

function iconType(href: string): string | undefined {
    const data = /^data:([^;,]+)/.exec(href)
    if (data) return data[1]
    const path = href.split(/[?#]/)[0]!.toLowerCase()
    if (path.endsWith('.svg')) return 'image/svg+xml'
    if (path.endsWith('.ico')) return 'image/x-icon'
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.webp')) return 'image/webp'
    // Sin extensión (assets direccionados por contenido): el navegador lo detecta.
    return undefined
}

/** Reemplaza los `<link rel=icon>` del documento por uno que apunta a `href`. */
export function applyBrandFavicon(href: string): void {
    if (!href || typeof document === 'undefined') return
    document
        .querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')
        .forEach((el) => el.remove())
    const link = document.createElement('link')
    link.rel = 'icon'
    const type = iconType(href)
    if (type) link.type = type
    link.href = href
    document.head.appendChild(link)
}

// Solo escribe colores presentes: un color vacío no borra el que haya pintado
// el host (p. ej. `applyBranding` de app-providers con sus defaults).
function setColorVar(name: string, value: string) {
    if (!value) return
    const root = document.documentElement
    if (root.style.getPropertyValue(name).trim() !== value) root.style.setProperty(name, value)
}

export function BrandDocumentSync(): null {
    const { name, favicon, logo, primaryColor, accentColor } = useBrand()
    const iconHref = favicon || logo

    useEffect(() => {
        if (name) document.title = name
    }, [name])

    useEffect(() => {
        applyBrandFavicon(iconHref)
    }, [iconHref])

    useEffect(() => {
        setColorVar(BRAND_CSS_VARS.primary, primaryColor)
        setColorVar(BRAND_CSS_VARS.accent, accentColor)
    }, [primaryColor, accentColor])

    return null
}
