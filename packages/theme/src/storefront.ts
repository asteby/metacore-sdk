/** Storefront theme tokens → CSS. Shared by ops studio and the storefront. */
import fontCatalogJson from './font-catalog.json'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim())
}

/** '#abc' -> '#aabbcc', minúsculas. */
export function normalizeHex(v: string): string {
  let h = v.trim().toLowerCase()
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  return h
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminancia relativa WCAG 2.x. */
export function luminance(hex: string): number {
  const h = normalizeHex(hex)
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Razón de contraste WCAG entre dos colores hex (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const LIGHT_INK = '#ffffff'
export const DARK_INK = '#171717'

/**
 * Color de texto sobre `bg`. Preferimos blanco mientras alcance 3:1 (texto
 * grande/negrita, que es lo que se pinta sobre botones y pastillas); si no,
 * el tono oscuro. Con 3:1 el rojo por defecto (#ff2400) conserva su texto blanco.
 */
export function readableOn(bg: string): string {
  if (!isHex(bg)) return LIGHT_INK
  return contrastRatio(LIGHT_INK, bg) >= 3 ? LIGHT_INK : DARK_INK
}

function mixHex(a: string, b: string, t: number): string {
  const ha = normalizeHex(a)
  const hb = normalizeHex(b)
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  const out = [1, 3, 5].map((i) => Math.round(ch(ha, i) + (ch(hb, i) - ch(ha, i)) * t))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Superficies claras/oscuras más exigentes donde se pinta texto de color de marca (--muted / --card). */
export const INK_SURFACE_LIGHT = '#ebe9e4'
export const INK_SURFACE_DARK = '#202020'

/**
 * Variante del color de marca apta para TEXTO pequeño (>= 4.5:1, WCAG AA) sobre las superficies de la
 * tienda: se oscurece (modo claro) o aclara (modo oscuro) lo mínimo necesario. El color de marca puro
 * sigue siendo el de botones, bordes y fondos; esta variante es --cta-ink / clase `text-cta-ink`.
 */
export function ctaInk(brand: string, mode: 'light' | 'dark'): string {
  if (!isHex(brand)) return brand
  const bg = mode === 'light' ? INK_SURFACE_LIGHT : INK_SURFACE_DARK
  const target = mode === 'light' ? '#000000' : '#ffffff'
  if (contrastRatio(brand, bg) >= 4.5) return normalizeHex(brand)
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mixHex(brand, target, t)
    if (contrastRatio(c, bg) >= 4.5) return c
  }
  return target
}

/**
 * Fondo de botón/pastilla de marca con texto legible (>= 4.5:1, AA) para el `readableOn` de la marca:
 * el color de marca tal cual si ya alcanza; si no, se oscurece (texto blanco) o se aclara (texto oscuro).
 * Es --cta-solid / clase `bg-cta-solid`. Los fondos decorativos siguen usando --cta puro.
 */
export function ctaSolid(brand: string): string {
  if (!isHex(brand)) return brand
  const fg = readableOn(brand)
  if (contrastRatio(fg, brand) >= 4.5) return normalizeHex(brand)
  const target = fg === LIGHT_INK ? '#000000' : '#ffffff'
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mixHex(brand, target, t)
    if (contrastRatio(fg, c) >= 4.5) return c
  }
  return target
}

/**
 * Color de marca apto para elementos de interfaz (botones, radios, bordes, anillo de foco: >= 3:1, WCAG
 * 1.4.11) sobre el fondo del modo oscuro. Un azul marino que se lee en claro desaparece en oscuro; se
 * aclara lo mínimo. Una tienda que define su propia paleta oscura no pasa por aquí.
 */
export function onDarkSurface(brand: string): string {
  if (!isHex(brand)) return brand
  if (contrastRatio(brand, INK_SURFACE_DARK) >= 3) return normalizeHex(brand)
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mixHex(brand, '#ffffff', t)
    if (contrastRatio(c, INK_SURFACE_DARK) >= 3) return c
  }
  return '#ffffff'
}


/* Tema visual (documento "theme" del contenido editable)               */
/* ------------------------------------------------------------------ */

/** Subconjunto del documento de tema que usa la marca (backend/content_spec.go). */
export type ThemeLike = {
  primary_color?: string
  accent_color?: string
  secondary_color?: string
  radius?: string
  font_display?: string
  font_body?: string
  header_variant?: string
  card_variant?: string
  footer_variant?: string
  button_shape?: string
  palette_light?: Record<string, string>
  palette_dark?: Record<string, string>
  default_mode?: string
  mode_toggle?: string
}

/** Minimal brand color surface — storefront Brand extends this. */
export type BrandColors = {
  primaryColor: string
  accentColor: string
  secondaryColor: string
}

/**
 * El tema publicado reemplaza los colores de la marca cuando trae uno válido;
 * sin tema (o con campos vacíos) la marca queda exactamente como estaba.
 */
export function applyThemeColors<T extends BrandColors>(
  brand: T,
  theme: ThemeLike | null | undefined,
): T {
  if (!theme) return brand
  const primary = isHex(theme.primary_color) ? normalizeHex(theme.primary_color) : brand.primaryColor
  const accent = isHex(theme.accent_color)
    ? normalizeHex(theme.accent_color)
    : isHex(theme.primary_color)
      ? primary
      : brand.accentColor
  const secondary = isHex(theme.secondary_color)
    ? normalizeHex(theme.secondary_color)
    : brand.secondaryColor
  if (
    primary === brand.primaryColor &&
    accent === brand.accentColor &&
    secondary === brand.secondaryColor
  ) {
    return brand
  }
  return { ...brand, primaryColor: primary, accentColor: accent, secondaryColor: secondary }
}

const RADIUS: Record<string, string> = { none: '0', sm: '.375rem', md: '.75rem', lg: '1.25rem' }
export type CatalogFont = {
  id: string
  family: string
  kind: 'sans' | 'serif' | 'condensed'
  label?: string
  spec?: string
}
export const fontCatalog = fontCatalogJson as CatalogFont[]
const CATALOG = fontCatalog.reduce<Record<string, string>>((m, f) => {
  const tail = f.kind === 'serif' ? 'ui-serif,Georgia,Cambria,serif' : 'ui-sans-serif,system-ui,sans-serif'
  m[f.id] = `"${f.family}",${tail}`
  return m
}, {})
const DISPLAY_FONT: Record<string, string> = {
  condensed: '"Barlow Condensed","Figtree",ui-sans-serif,system-ui,sans-serif',
  sans: '"Figtree",ui-sans-serif,system-ui,sans-serif',
  serif: 'ui-serif,Georgia,Cambria,"Times New Roman",serif',
}
const BODY_FONT: Record<string, string> = {
  sans: '"Figtree",ui-sans-serif,system-ui,sans-serif',
  serif: 'ui-serif,Georgia,Cambria,"Times New Roman",serif',
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
}

/**
 * Paleta completa del tema (claro y oscuro por separado). Cada clave es un token de styles.css
 * (`card_foreground` → `--card-foreground`). El servidor ya validó claves, hex y contraste; aquí solo
 * se vuelve CSS. cta-ink y cta-solid se derivan del color de llamada a la acción.
 */
function paletteVars(p: Record<string, string> | undefined, mode: 'light' | 'dark'): string {
  if (!p) return ''
  const out: string[] = []
  for (const [k, v] of Object.entries(p)) if (isHex(v) && /^[a-z_]+$/.test(k)) out.push(`--${k.replace(/_/g, '-')}:${normalizeHex(v)}`)
  const cta = p.cta
  if (isHex(cta)) out.push(`--brand:${normalizeHex(cta)}`, `--cta-ink:${ctaInk(cta, mode)}`, `--cta-solid:${ctaSolid(cta)}`)
  return out.join(';')
}

export function paletteCss(theme: ThemeLike | null | undefined): string {
  if (!theme) return ''
  const light = paletteVars(theme.palette_light, 'light')
  const dark = paletteVars(theme.palette_dark, 'dark')
  let css = ''
  if (light) {
    css +=
      `@media (prefers-color-scheme: light){html:root:not(.theme-manual):not(.dark){${light}}}` +
      `html:root.theme-manual:not(.dark){${light}}`
  }
  if (dark) css += `html.dark:root{${dark}}@media (prefers-color-scheme: dark){html:root:not(.theme-manual){${dark}}}`
  return css
}

/**
 * Variantes de diseño. El CSS vive aquí, en el núcleo: el tema solo elige una
 * clave de una lista cerrada que el servidor ya validó, así que una tienda
 * cambia cómo se ve sin poder inyectar estilos ni romper el checkout.
 */
const HEADER_VARIANT: Record<string, string> = {
  minimal:
    'html .site-header{background:var(--card);border-bottom-color:transparent;box-shadow:none;backdrop-filter:none}' +
    'html .site-header nav button{text-transform:none;letter-spacing:0;font-size:.875rem;font-weight:600}',
  dark:
    'html .site-header{background:#0b1220;color:#fff;border-bottom-color:rgba(255,255,255,.1);box-shadow:none}' +
    'html .site-header nav button,html .site-header nav button[aria-current]{color:rgba(255,255,255,.75)}' +
    'html .site-header nav button:hover,html .site-header nav button[aria-current=page]{color:#fff}' +
    'html .site-header button:not(.site-header-account){color:#fff}',
}
const CARD_VARIANT: Record<string, string> = {
  clean:
    'html .pcard{border-color:transparent;background:transparent;box-shadow:none;border-radius:0}' +
    'html .pcard:hover{transform:none;box-shadow:none;border-color:transparent}' +
    'html .pcard .pcard-title{text-transform:none;letter-spacing:0;font-weight:600;font-size:.95rem}',
  soft:
    'html .pcard{border-radius:1rem;border-color:transparent;box-shadow:0 10px 30px -18px rgba(0,0,0,.35)}' +
    'html .pcard .pcard-title{text-transform:none;letter-spacing:0}',
}
const FOOTER_VARIANT: Record<string, string> = {
  light:
    'html .site-footer{background:var(--card);color:var(--foreground);border-top:1px solid var(--border)}' +
    'html .site-footer :not(.fixed,.fixed *){color:var(--foreground)}' +
    'html .site-footer .border-white\\/10{border-color:var(--border)}',
}
const BUTTON_SHAPE: Record<string, string> = {
  square: '0',
  rounded: '.5rem',
  pill: '9999px',
}

/**
 * Esquinas y tipografías del tema. Las tipografías son pilas del sistema o las
 * dos que ya carga la tienda (nada se descarga de más). '' = sin cambios.
 */
export function themeCss(theme: ThemeLike | null | undefined): string {
  if (!theme) return ''
  const out: string[] = []
  const radius = RADIUS[theme.radius ?? '']
  if (radius !== undefined) out.push(`:root{--radius:${radius}}`)
  const display = DISPLAY_FONT[theme.font_display ?? ''] ?? CATALOG[theme.font_display ?? '']
  if (display) out.push(`html .font-display{font-family:${display}}`)
  const body = BODY_FONT[theme.font_body ?? ''] ?? CATALOG[theme.font_body ?? '']
  if (body) out.push(`html body,html .font-sans{font-family:${body}}`)
  const shape = BUTTON_SHAPE[theme.button_shape ?? '']
  if (shape !== undefined) out.push(`html button.inline-flex,html a.inline-flex{border-radius:${shape}}`)
  out.push(HEADER_VARIANT[theme.header_variant ?? ''] ?? '', CARD_VARIANT[theme.card_variant ?? ''] ?? '', FOOTER_VARIANT[theme.footer_variant ?? ''] ?? '', paletteCss(theme))
  return out.join('')
}

/* ------------------------------------------------------------------ */
