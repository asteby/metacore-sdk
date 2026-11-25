/**
 * Modos de presentacion del widget y su normalizacion. Modulo puro (sin DOM ni React): lo comparten
 * el loader (IIFE sin dependencias), el perfil validado del frame y el embed en codigo, asi cada
 * limite y cada defecto vive en un solo lugar.
 */

export type DisplayMode = 'floating' | 'inline' | 'push'
export type LauncherShape = 'round' | 'rounded' | 'square'
export type LauncherPosition = 'bottom-right' | 'bottom-left'

export const DISPLAY_MODES: readonly DisplayMode[] = ['floating', 'inline', 'push']
export const LAUNCHER_SHAPES: readonly LauncherShape[] = ['round', 'rounded', 'square']

export const DISPLAY_LIMITS = {
  /** Alto del embed incrustado (px). */
  height: { min: 200, max: 2000, def: 600 },
  /** Ancho del panel flotante / lateral (px). */
  width: { min: 280, max: 720, def: 400 },
  /** Ancho historico del panel flotante cuando nadie fija `panel_width`. */
  floatingWidth: 380,
  /** Separacion al borde del lanzador flotante (px). */
  offset: { min: 0, max: 200, def: 16 },
  selector: 200,
  label: 60,
  /** Selector que se busca cuando el modo es `inline` y nadie indica otro. */
  defaultTarget: '#metacore-support',
} as const

export const asMode = (v: unknown): DisplayMode | undefined =>
  typeof v === 'string' && (DISPLAY_MODES as readonly string[]).includes(v) ? (v as DisplayMode) : undefined

export const asShape = (v: unknown): LauncherShape | undefined =>
  typeof v === 'string' && (LAUNCHER_SHAPES as readonly string[]).includes(v) ? (v as LauncherShape) : undefined

export const asPosition = (v: unknown): LauncherPosition | undefined => (v === 'bottom-left' || v === 'bottom-right' ? v : undefined)

/** Entero (o numero en texto, p. ej. un `data-*`) acotado a `[min, max]`; cualquier otra cosa es `undefined`. */
export function asClamped(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && /^\d{1,5}$/.test(v.trim()) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Selector CSS como texto acotado. No se interpreta aqui: solo se usa con `querySelector` en try/catch. */
export const asSelector = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s.length > 0 && s.length <= DISPLAY_LIMITS.selector ? s : undefined
}

export const asLabel = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s.length > 0 && [...s].length <= DISPLAY_LIMITS.label ? s : undefined
}

/** Campos de presentacion ya validados; todo es opcional y `undefined` significa "defecto del modo". */
export interface DisplaySettings {
  mode?: DisplayMode
  target?: string
  height?: number
  width?: number
  offset?: number
  position?: LauncherPosition
  shape?: LauncherShape
  label?: string
}

/** Fusiona capas de menor a mayor prioridad: la ultima capa con un valor definido gana por campo. */
export function mergeSettings(...layers: Array<DisplaySettings | undefined>): DisplaySettings {
  const out: DisplaySettings = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [k, v] of Object.entries(layer)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/** Normaliza opciones sin confiar en su tipo (vienen de `init`, `data-*` o JSON de red). */
export function normalizeSettings(raw: {
  mode?: unknown
  target?: unknown
  height?: unknown
  width?: unknown
  offset?: unknown
  position?: unknown
  shape?: unknown
  label?: unknown
}): DisplaySettings {
  const s: DisplaySettings = {
    mode: asMode(raw.mode),
    target: asSelector(raw.target),
    height: asClamped(raw.height, DISPLAY_LIMITS.height.min, DISPLAY_LIMITS.height.max),
    width: asClamped(raw.width, DISPLAY_LIMITS.width.min, DISPLAY_LIMITS.width.max),
    offset: asClamped(raw.offset, DISPLAY_LIMITS.offset.min, DISPLAY_LIMITS.offset.max),
    position: asPosition(raw.position),
    shape: asShape(raw.shape),
    label: asLabel(raw.label),
  }
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as DisplaySettings
}

/** Campos de presentacion tal como viajan en el perfil publico (nombres del contrato) y en el mensaje `profile`. */
export interface ProfileDisplay {
  display_mode?: DisplayMode
  inline_target?: string
  inline_height?: number
  panel_width?: number
  offset?: number
  launcher_shape?: LauncherShape
  launcher_label?: string
}

/** Extrae y valida los campos de presentacion de un objeto no confiable; omite los invalidos o ausentes. */
export function parseProfileDisplay(data: Record<string, unknown>): ProfileDisplay {
  const display: ProfileDisplay = {
    display_mode: asMode(data.display_mode),
    inline_target: asSelector(data.inline_target),
    inline_height: asClamped(data.inline_height, DISPLAY_LIMITS.height.min, DISPLAY_LIMITS.height.max),
    panel_width: asClamped(data.panel_width, DISPLAY_LIMITS.width.min, DISPLAY_LIMITS.width.max),
    offset: asClamped(data.offset, DISPLAY_LIMITS.offset.min, DISPLAY_LIMITS.offset.max),
    launcher_shape: asShape(data.launcher_shape),
    launcher_label: asLabel(data.launcher_label),
  }
  return Object.fromEntries(Object.entries(display).filter(([, v]) => v !== undefined)) as ProfileDisplay
}

/** Capa de presentacion que sale del mensaje `profile` (nombres del contrato -> nombres de opcion). */
export const settingsFromProfile = (m: ProfileDisplay & { position?: LauncherPosition }): DisplaySettings => ({
  mode: m.display_mode,
  target: m.inline_target,
  height: m.inline_height,
  width: m.panel_width,
  offset: m.offset,
  position: m.position,
  shape: m.launcher_shape,
  label: m.launcher_label,
})

/** Radio del lanzador segun su forma (`round` conserva la pastilla historica). */
export const SHAPE_RADIUS: Record<LauncherShape, string> = { round: '9999px', rounded: '20px', square: '14px' }

/** Mueve el contenido de la pagina para el modo `push`; devuelve la funcion que lo restaura. */
export function createPagePusher(doc: Document) {
  let saved: { prop: 'marginLeft' | 'marginRight'; margin: string; transition: string } | null = null
  const restore = () => {
    const body = doc.body
    if (!body || !saved) return
    body.style[saved.prop] = saved.margin
    body.style.transition = saved.transition
    saved = null
  }
  return {
    push(side: 'left' | 'right', px: number) {
      const body = doc.body
      if (!body) return
      const prop = side === 'right' ? 'marginRight' : 'marginLeft'
      if (saved && saved.prop !== prop) restore()
      if (!saved) saved = { prop, margin: body.style[prop], transition: body.style.transition }
      body.style.transition = 'margin 320ms cubic-bezier(.2,.8,.2,1)'
      body.style[prop] = `${px}px`
    },
    restore,
  }
}
