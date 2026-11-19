/** genui/v1 — the declarative UI contract shared with the Go kernel (package genui). */
export const GENUI_VERSION = 'genui/v1' as const

export type Tone = 'default' | 'muted' | 'info' | 'success' | 'warning' | 'danger'
export type Scalar = string | number | boolean | null

export interface UIBadge {
  label: string
  tone?: Tone
}
export interface UIField {
  label: string
  value: string
}
export interface UIItem {
  label?: string
  value?: string
  hint?: string
  trend?: 'up' | 'down' | 'flat'
  title?: string
  url?: string
  source?: string
  date?: string
  time?: string
  description?: string
  status?: string
  tone?: Tone
}
/** Texto literal o clave i18n del host (`{ $t }`), resuelto con el `t` del provider. */
export type UIText = string | { $t: string; args?: Record<string, unknown> }
/** Formatos de valor de columna (los mismos que `statFormat` del esquema). */
export type UIColumnFormat = 'number' | 'currency' | 'percent' | 'compact' | 'date' | 'datetime' | 'relative_date'
export interface UIColumn {
  key: string
  label: string
  /** Formato del valor (fechas, moneda...) con la configuracion regional del host. */
  format?: UIColumnFormat
  /** `text` (por defecto), `badge` (insignia con tono) o `icon_text` (icono + texto). */
  variant?: 'text' | 'badge' | 'icon_text'
  /** valor -> tono (reusa el mapeo tono->clases de las insignias). */
  tones?: Record<string, Tone>
  /** valor -> texto legible; sin entrada se humaniza el valor (nunca la clave cruda). */
  labels?: Record<string, UIText>
  /** valor -> nombre de icono (host/conjunto interno); si no se conoce, se omite. */
  icons?: Record<string, string>
}
export interface UIOption {
  value: string
  label: string
}
export interface UIInput {
  name: string
  label: string
  kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
  value?: Scalar
  required?: boolean
  options?: UIOption[]
  help?: string
}
export interface UIAction {
  id: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  params?: Record<string, Scalar>
}

interface BlockBase {
  title?: string
}
export interface TextBlock {
  type: 'text'
  text: string
  tone?: Tone
}
export interface KPIBlock extends BlockBase {
  type: 'kpi'
  items: UIItem[]
}
export interface CardBlock extends BlockBase {
  type: 'card'
  title: string
  subtitle?: string
  body?: string
  badges?: UIBadge[]
  fields?: UIField[]
  link?: string
  tone?: Tone
}
export interface TableBlock extends BlockBase {
  type: 'table'
  columns: UIColumn[]
  rows?: Record<string, Scalar>[]
  caption?: string
  /** Alto maximo con scroll interno y cabecera fija (ver `TABLE_MAX_HEIGHT`). */
  max_height?: 'sm' | 'md' | 'lg'
  /** `compact`: filas compactas tambien en contenedor estrecho (sin tarjetas apiladas). */
  density?: 'compact' | 'comfortable'
}
export interface LinksBlock extends BlockBase {
  type: 'links'
  items: UIItem[]
}
export interface TimelineBlock extends BlockBase {
  type: 'timeline'
  items: UIItem[]
}
export interface ChartBlock extends BlockBase {
  type: 'chart'
  kind: 'bar' | 'line'
  x: string
  series: UIColumn[]
  rows?: Record<string, Scalar>[]
  summary: string
  caption?: string
}
export interface ConfirmBlock extends BlockBase {
  type: 'confirm'
  title: string
  description?: string
  fields?: UIField[]
  inputs?: UIInput[]
  actions: UIAction[]
  badges?: UIBadge[]
  tone?: Tone
}

export type UIBlock = TextBlock | KPIBlock | CardBlock | TableBlock | LinksBlock | TimelineBlock | ChartBlock | ConfirmBlock

export interface UISpec {
  version: typeof GENUI_VERSION
  title?: string
  blocks: UIBlock[]
}

/** What the renderer hands to the host when a declared action is pressed. */
export interface UIActionEvent {
  id: string
  params: Record<string, Scalar>
  /** Current values of the confirm block inputs (if any). */
  values: Record<string, Scalar>
}

export type UIActionHandler = (event: UIActionEvent) => void | Promise<void>
