// Loom — contratos del sistema de contribuciones de UI (RFC 0005 del kernel).
//
//   Seam     punto de extensión tipado de un componente anfitrión (`record.dialog.header`).
//   Part     componente expuesto por un addon con contrato (`fiscal_mexico.csf-import`).
//   Graft    injerto: Part → Seam con orden, condiciones, lentes leídas y campos escritos.
//   Lens     proyección de solo lectura del contexto del seam, con clase de datos.
//   Proposal lo que un injerto quiere cambiar: el anfitrión lo aplica, lo muestra como diff o lo descarta.
//
// El servidor es la fuente de verdad de QUÉ injertos ve el usuario (RBAC, ajustes, preset);
// el cliente vuelve a filtrar sólo para UX y explica por qué algo no se montó.
import type { ComponentType } from 'react'

/** Clase de datos de una lente. Decide la redacción en errores/telemetría. */
export type DataClass = 'public' | 'internal' | 'money' | 'pii' | 'pii.fiscal' | 'secret'

/** Contrato que el anfitrión publica para un seam. */
export interface SeamContract {
    id: string
    /** Semver del contrato (`1.0.0`). Un injerto declara `requires: '^1'`. */
    version: string
    /** Lentes que el seam ofrece y su clase de datos. */
    lenses: Readonly<Record<string, DataClass>>
    /**
     * Campos que un injerto puede proponer cambiar en este seam. `undefined` = el seam no
     * acepta propuestas. El anfitrión lo calcula (p. ej. los campos editables del formulario).
     */
    writable?: ReadonlySet<string>
    /** Intenciones que el anfitrión atiende (`record.select`, `record.edit`). */
    intents?: readonly string[]
    /**
     * Clase de datos por campo escribible (p. ej. `password: 'secret'`). Un parche que toca un campo
     * `secret` nunca se aplica solo: siempre pasa por el diff revisable.
     */
    fieldClasses?: Readonly<Record<string, DataClass>>
}

export type GraftKind = 'view' | 'action' | 'transform' | 'source'

/** Condiciones de montaje. Todas las presentes deben cumplirse. */
export interface GraftWhen {
    /** Todos estos permisos RBAC. */
    permission?: string | string[]
    /** Al menos uno de estos permisos. */
    anyPermission?: string[]
    /** Feature flag activo. */
    flag?: string
    /** Ajuste de la organización/addon: presente y verdadero, o igual a `equals`. */
    setting?: { key: string; equals?: unknown }
    /** Modelos del anfitrión (acepta `Customer` o `customers.Customer`). */
    model?: string[]
    /** Modos del anfitrión (`create`, `edit`, `view`). */
    mode?: string[]
}

export interface GraftCapabilities {
    /** Proponer un parche. Sólo pasan los campos de `writes` ∩ `contract.writable`. */
    propose: (p: ProposalInput) => void
    /** Pedir al anfitrión una intención declarada en el contrato. false = nadie la atendió. */
    emit: (intent: string, payload?: unknown) => boolean
    /** RBAC del usuario actual (mismo `useCan` del host). */
    can: (permission: string) => boolean
    /**
     * Búsqueda de solo lectura MEDIADA por el anfitrión (`needs.records.find`): la Part no tiene red;
     * el host consulta con su cliente de datos y los permisos del usuario. Campo exacto, como mucho
     * `RECORDS_FIND_MAX` resultados, sin listados. Ausente si la Part no la declaró o el host no la ofrece.
     */
    records?: { find: (q: RecordsFindQuery) => Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> }
}

/** Una búsqueda por igualdad exacta de un campo. */
export interface RecordsFindQuery {
    /** Modelo declarado en `recordsFind` (`customers.Customer` o `Customer`). */
    model: string
    /** Campo del modelo (`tax_id`). */
    field: string
    /** Valor exacto (no admite comodines). */
    value: string
    /** 1..RECORDS_FIND_MAX (por omisión 3). */
    limit?: number
}

/** Lo que implementa el anfitrión: recibe la consulta ya validada y acotada. */
export type RecordsFinder = (q: Required<RecordsFindQuery>) => Promise<Record<string, unknown>[]>

export const RECORDS_FIND_MAX = 5

export interface GraftProps<P = Record<string, unknown>> {
    /** Sólo las lentes declaradas en `reads`, congeladas. */
    lenses: Readonly<Record<string, unknown>>
    /** Props estáticas del manifiesto/registro. */
    props: P
    caps: GraftCapabilities
    graft: { id: string; addon: string; seam: string }
}

export type GraftComponent<P = Record<string, unknown>> = ComponentType<GraftProps<P>>

export type GraftModule = GraftComponent<any> | { default: GraftComponent<any> }

/** Componente expuesto por un addon (lo que el manifiesto llama `extension_points.parts[]`). */
export interface PartDef {
    /** `<addon>.<nombre>`. */
    id: string
    addon?: string
    version?: string
    component?: GraftComponent<any>
    /** Carga perezosa (chunk local o remoto federado). */
    load?: () => Promise<GraftModule>
    /**
     * La Part tiene su propio paso de revisión campo a campo (el lector de constancia). Solo entonces
     * una propuesta `apply: 'auto'` se aplica directa (con «Deshacer»); sin esto, siempre diff.
     */
    selfReview?: boolean
    /** Modelos que la Part puede buscar por el anfitrión (`ui.exposes[].needs.records.find`). */
    recordsFind?: string[]
}

export interface GraftDef {
    /** Id estable `<addon>.<nombre>`; registrar el mismo id reemplaza. */
    id: string
    addon?: string
    seam: string
    /** Rango semver del contrato del seam (`^1`). Sin él, cualquiera. */
    requires?: string
    kind?: GraftKind
    /** Ascendente; empates por orden de registro. */
    order?: number
    when?: GraftWhen
    /** Lentes que lee. Una lente no declarada no llega. */
    reads?: string[]
    /** Campos que puede proponer cambiar. Admite `prefijo.*`. */
    writes?: string[]
    /** Red que necesita (declarativo; lo hace cumplir el sandbox/CSP, ver RFC §Seguridad). */
    network?: 'none' | 'org' | string[]
    offline?: boolean
    props?: Record<string, unknown>
    /** Part que monta (registrado con `registerPart`) o el componente en línea. */
    part?: string
    component?: GraftComponent<any>
    load?: () => Promise<GraftModule>
    /** Igual que `PartDef.selfReview`, para un injerto con componente en línea. */
    selfReview?: boolean
    /** Igual que `PartDef.recordsFind`, para un injerto con componente en línea. */
    recordsFind?: string[]
}

export interface ProposalInput {
    patch: Record<string, unknown>
    /** Por qué (se muestra al usuario): «Datos de la constancia fiscal». */
    reason?: string
    /** 0..1. */
    confidence?: number
    /** Etiquetas legibles por campo, si el injerto las conoce. */
    labels?: Record<string, string>
    /**
     * `review` (por omisión) o `auto`. `auto` solo vale si la Part declara `selfReview` y ningún campo
     * del parche es de clase `secret`; si no, el seam lo baja a `review`.
     */
    apply?: 'review' | 'auto'
}

export interface Proposal extends ProposalInput {
    id: string
    graft: string
    addon: string
    /** Valores antes del parche (para el diff y el deshacer). */
    previous: Record<string, unknown>
    /** Claves descartadas por no estar en `writes`/`writable`. */
    dropped: string[]
}

export type SkipReason =
    | 'not_granted'
    | 'permission'
    | 'flag'
    | 'setting'
    | 'model'
    | 'mode'
    | 'version'
    | 'no_component'

export interface SkippedGraft {
    graft: GraftDef
    reason: SkipReason
    detail?: string
}

export interface ResolvedSeam {
    mounted: GraftDef[]
    skipped: SkippedGraft[]
}

/** Lo que el anfitrión sabe del usuario/organización para evaluar `when`. */
export interface LoomEnv {
    can: (permission: string) => boolean
    flags?: ReadonlySet<string>
    settings?: Readonly<Record<string, unknown>>
    model?: string
    mode?: string
    /**
     * Ids de injertos que el servidor autorizó para este usuario. Presente = el cliente no monta
     * nada fuera de la lista (el servidor manda). Ausente = sólo código local de confianza.
     */
    granted?: ReadonlySet<string>
}

export type LoomEvent =
    | { type: 'graft_failed'; seam: string; graft: string; addon: string; reason: 'load' | 'render'; message: string }
    | { type: 'proposal_dropped_keys'; seam: string; graft: string; addon: string; keys: string[] }
    /** Auditoría de `records.find`: modelo, campo y cuántos resultados; NUNCA el valor buscado (pii). */
    | {
          type: 'records_find'
          seam: string
          graft: string
          addon: string
          model: string
          field: string
          outcome: 'ok' | 'denied' | 'error'
          count: number
          reason?: string
      }
