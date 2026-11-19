// Legible base-map labels on any style. Third-party styles ship label colours chosen for taste, not for contrast (the
// OpenFreeMap `dark` style paints city names rgb(101,101,101) on rgb(12,12,12): 3.3:1). After every style load this raises
// the text colour of each symbol layer to ≥ 4.5:1 against the style's own background (`ensureContrast`, OKLCH lightness
// only, hue kept) and, if the halo no longer separates text from the map, sets it to the background colour. One rule for
// every scheme: a style that already reads is left untouched, so there is no per-theme table to keep in sync.
import type * as ML from 'maplibre-gl'
import { WCAG, composite, contrastRatio, ensureContrast, parseColor, toHex } from '@asteby/metacore-theme/contrast'

type Layer = { id: string; type: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }

const WHITE = { r: 1, g: 1, b: 1, a: 1 }
/** A plain colour string (data-driven expressions are arrays and are left alone). */
const plain = (v: unknown): string | undefined => (typeof v === 'string' && parseColor(v) ? v : undefined)

/** Raises label colours of the loaded style to `min` contrast against its background layer. Safe on partial maps (tests). */
export function applyLabelContrast(map: ML.Map, min: number = WCAG.text): void {
    if (typeof map.getStyle !== 'function' || typeof map.setPaintProperty !== 'function') return
    const layers = ((map.getStyle() as { layers?: Layer[] } | undefined)?.layers ?? []) as Layer[]
    const bgColor = plain(layers.find((l) => l.type === 'background')?.paint?.['background-color'])
    if (!bgColor) return
    const bgP = parseColor(bgColor)
    if (!bgP) return
    const bgFlat = composite(bgP, WHITE)
    const bg = toHex(bgFlat)
    for (const l of layers) {
        if (l.type !== 'symbol' || !l.layout?.['text-field']) continue
        const color = plain(l.paint?.['text-color'])
        if (!color) continue
        const text = ensureContrast(color, bg, min, { format: 'hex' })
        if (text !== toHex(composite(parseColor(color)!, WHITE))) map.setPaintProperty(l.id, 'text-color', text)
        const halo = plain(l.paint?.['text-halo-color'])
        if (halo && Number(l.paint?.['text-halo-width']) > 0 && contrastRatio(text, composite(parseColor(halo)!, bgFlat)) < min) {
            map.setPaintProperty(l.id, 'text-halo-color', bg)
        }
    }
}
