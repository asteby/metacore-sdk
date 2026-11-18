// Contrato del bloque custom `block@1` (solo TIPO + registro local). La carga
// federada, SRI, iframe y presupuesto NO estan aqui: el host los resolvera en
// otra fase y registrara el resultado con `registerPageBlock`.
import type { ComponentType } from 'react'
import type { GenUIRow } from '../registry'

export const BLOCK_API = 'block@1' as const

/** Estado de una fuente tal como la recibe un bloque custom. */
export interface BlockData {
  status: 'loading' | 'ready' | 'error'
  rows?: GenUIRow[]
  error?: string
}

export interface BlockSize {
  cols?: number
  rows?: number
  breakpoint: 'narrow' | 'wide'
}

export type BlockScalar = string | number | boolean | null

export interface BlockEmit {
  /** Escribe `state.<key>`; solo claves declaradas en `writes`. */
  (event: 'set', payload: { key: string; value: unknown }): void
  /** Evento declarado en `events`, payload escalar. */
  (event: string, payload?: Record<string, BlockScalar>): void
}

export interface BlockComponentProps<P = Record<string, BlockScalar | BlockScalar[]>> {
  props: P
  /** Snapshot de solo lectura de las claves declaradas en `reads` (`state.x`, `ctx.x`). */
  context: Record<string, unknown>
  /** Fuentes declaradas en `data`, ya resueltas por la pagina. */
  data: Record<string, BlockData>
  emit: BlockEmit
  size: BlockSize
}

/** Declaracion de un bloque custom (lo que `contributions.blocks[]` describe + el componente). */
export interface BlockDefinition<P = Record<string, BlockScalar | BlockScalar[]>> {
  api: typeof BLOCK_API
  /** `<addon>.<nombre>@<mayor>`, igual que `ext` en genui/v2. */
  name: string
  /** Subconjunto de JSON Schema de las props (escalares); el host valida antes de montar. */
  props_schema?: Record<string, unknown>
  reads?: string[]
  writes?: string[]
  data?: string[]
  events?: string[]
  permission?: string
  component: ComponentType<BlockComponentProps<P>>
}

const NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*@[1-9][0-9]*$/
const KEY = /^(state|ctx)\.[A-Za-z_][A-Za-z0-9_.]*$/

/** Define un bloque custom. Valida el contrato en el acto (falla ruidosamente al desarrollar). */
export function defineBlock<P = Record<string, BlockScalar | BlockScalar[]>>(def: Omit<BlockDefinition<P>, 'api'> & { api?: typeof BLOCK_API }): BlockDefinition<P> {
  if (def.api !== undefined && def.api !== BLOCK_API) throw new Error(`defineBlock: api ${String(def.api)} no soportada (solo ${BLOCK_API})`)
  if (!NAME.test(def.name)) throw new Error(`defineBlock: nombre invalido "${def.name}" (esperado <addon>.<nombre>@<mayor>)`)
  for (const r of def.reads ?? []) if (!KEY.test(r)) throw new Error(`defineBlock: reads "${r}" invalido (state.* o ctx.*)`)
  for (const w of def.writes ?? []) if (!/^state\./.test(w) || !KEY.test(w)) throw new Error(`defineBlock: writes "${w}" invalido (solo state.*)`)
  return { ...def, api: BLOCK_API }
}

const blocks = new Map<string, BlockDefinition<any>>() // eslint-disable-line @typescript-eslint/no-explicit-any

/** Registra un bloque custom ya cargado. Devuelve la funcion que lo retira. */
export function registerPageBlock(def: BlockDefinition<any>): () => void { // eslint-disable-line @typescript-eslint/no-explicit-any
  blocks.set(def.name, def)
  return () => void (blocks.get(def.name) === def && blocks.delete(def.name))
}

export function getPageBlock(name: string): BlockDefinition<any> | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  return blocks.get(name)
}
