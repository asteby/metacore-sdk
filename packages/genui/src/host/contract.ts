// Contrato del adaptador de host de `GenUIBody` (`genui.host/v1`).
//
// `GenUIBody` es el UNICO camino de render de un cuerpo `ui` genui/v2 (paginas
// declarativas, widget de Tablero, chat de la IA). Todo lo que pertenece al host
// (HTTP, permisos, router, i18n, bloques federados, MapLibre) entra por este
// adaptador: el SDK no conoce a ningun host concreto.
import type { BlockDefinition } from '../page/custom'
import type { PageBus, UrlStateAdapter } from '../page/context'
import type { GenUIActionRequest, GenUIRow } from '../registry'
import type { GenUIIconResolver } from '../icons'

export const GENUI_HOST_API = 'genui.host/v1' as const

/** Identidad del documento: llaves de cache, bus del host y auditoria. */
export interface GenUIScope {
  addon: string
  page: string
}

/** Definicion de una fuente tal como la declara `ui.data.<name>`: `{q}`, `{widget}`, `{inline}`... (opaca para el SDK). */
export type GenUISourceDef = unknown

export interface SourceRequest {
  /** Nombre en `ui.data`. */
  name: string
  def: GenUISourceDef
  scope: GenUIScope
  signal: AbortSignal
}

/**
 * Resuelve las fuentes de un documento con los permisos del que mira. El host
 * implementa `q:`/`t:`/`r:`/`widget`/`inline` por su compuerta; el SDK solo
 * orquesta carga, error aislado por fuente, reintento y poll.
 *
 * Para negar el acceso lanza un error con `denied === true` (ver {@link SourceDeniedError}).
 */
export interface SourceResolver {
  resolve(req: SourceRequest): Promise<GenUIRow[]>
}

/** Error de fuente: `denied` distingue «sin permiso» de «fallo». */
export class SourceDeniedError extends Error {
  readonly denied = true
  constructor(message = 'source denied') {
    super(message)
    this.name = 'SourceDeniedError'
  }
}

export function isSourceDenied(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { denied?: unknown }).denied === true
}

/** Textos de estado de fuente (el host los traduce; el SDK trae un default en espanol). */
export interface GenUIBodyLabels {
  sourceDenied: string
  sourceError: string
}

export interface GenUIHostAdapter {
  /** Version del contrato; informativa. */
  api?: typeof GENUI_HOST_API
  /** Fuentes. Sin resolver, las fuentes declaradas quedan en error «sin acceso» (nunca se inventan filas). */
  sources?: SourceResolver
  /** Permiso del que mira. Sin `can`, todo bloque con `permission` se niega. */
  can?: (permission: string) => boolean
  /** Verbos que llegan al host (`invoke`, `submit`, `emit` que no es de pagina, `open`...). Sin handler no hacen nada. */
  onAction?: (req: GenUIActionRequest) => void
  /** Navegacion interna. El SDK solo la llama con rutas internas seguras. Sin handler: no navega. */
  onNavigate?: (path: string) => void
  /** i18n del host: resuelve `{$t}`. */
  t?: (key: string, args?: Record<string, unknown>) => string
  locale?: string
  currency?: string
  /** Valores de solo lectura para `ctx.*` (locale, branch_id, org_id...). */
  ctx?: Record<string, unknown>
  /** Iconos declarados por nombre. */
  resolveIcon?: GenUIIconResolver
  /** `url_state` en la URL del host. Sin adaptador, `url_state` queda solo en memoria. */
  urlState?: UrlStateAdapter
  /** Conecta el bus de la pagina con el host (eventos hacia y desde). Devuelve la funcion de desconexion. */
  connectBus?: (bus: PageBus, scope: GenUIScope) => void | (() => void)
  /** Bloques custom (`component`/`ext`) que el host sabe montar para los nombres usados por el documento. */
  customBlocks?: (names: readonly string[]) => readonly BlockDefinition<any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Carga perezosa por TIPO de bloque (p. ej. `{ map: () => import('@asteby/metacore-maps/genui') }`); solo se invoca si el documento usa el tipo. */
  lazyBlocks?: Record<string, () => Promise<unknown>>
  /** Enlaces http(s) literales. Default `false`. */
  allowExternalLinks?: boolean
  labels?: Partial<GenUIBodyLabels>
}

/** Cuerpo `ui` ya validado (`{ state, data, blocks }`). */
export interface GenUIBodyDoc {
  state?: Record<string, unknown>
  data?: Record<string, unknown>
  url_state?: string[]
  blocks: Array<{ type: string; [key: string]: any }> // eslint-disable-line @typescript-eslint/no-explicit-any
  [key: string]: unknown
}
