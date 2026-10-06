// Patrón «página de documento» (benchmark §5.2 / §6 / §7): cabecera con badges,
// barra de acciones por estado, botones inteligentes con contador, pestañas e
// historial. Todo se describe con un `DocumentSpec` de datos puros (sin
// funciones) para que cualquier modelo lo declare y, más adelante, un manifest
// pueda proyectarlo sin cambiar los componentes.
import type { ReactNode } from 'react'

/** Tono semántico de un estado. El color nunca es la única señal: cada tono trae ícono y texto. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'caution' | 'warning' | 'critical'

/** Un estado del catálogo de un documento. */
export interface StatusDef {
    value: string
    /** Texto explícito (o clave i18n; se traduce con `t`). */
    label: string
    tone: StatusTone
    /** Texto tachado (Cancelada, Anulada): conserva el rastro sin alarmar. */
    strike?: boolean
}

/** Una máquina de estados con su propio badge (p. ej. fiscal y cobro, independientes). */
export interface StatusMachine {
    id: string
    /** Etiqueta accesible del badge («Estado fiscal»). */
    label?: string
    /** Ruta del valor en el contexto de evaluación (`record.x`, `$.x`). */
    field: string
    states: StatusDef[]
    /** Estado a mostrar cuando el valor no está en el catálogo. */
    fallback?: StatusDef
}

export type PredicateOp = 'eq' | 'neq' | 'in' | 'not_in' | 'truthy' | 'falsy' | 'gt' | 'gte' | 'lt' | 'lte'

/** Condición sobre una ruta del contexto. Un arreglo de predicados es un AND. */
export interface Predicate {
    field: string
    op: PredicateOp
    value?: unknown
}
export type When = Predicate | Predicate[]

/** Regla de bloqueo: si `when` se cumple, la acción se ve deshabilitada y `reason` explica qué hacer antes. */
export interface BlockRule {
    when: When
    reason: string
}

/** Un botón del documento (acción). `key` enlaza con `ActionDefinition.key` del modelo si existe. */
export interface DocumentActionDef {
    key: string
    label: string
    /** Nombre de ícono lucide. */
    icon?: string
    /** Acción del modelo (metadata) que se dispara; por defecto `key`. */
    modelAction?: string
    /**
     * Acciones que resuelve la propia página sin acción del modelo (las plantillas
     * interpolan `{{campo}}` / `{{$.derivado}}`):
     *  - `href`: navega dentro de la app (`onNavigate` del host).
     *  - `openUrl`: abre una URL en otra pestaña (descargar PDF/XML).
     *  - `tab`: selecciona una pestaña (ver detalle del error, ver pagos).
     */
    href?: string
    openUrl?: string
    tab?: string
    /**
     * "secondary" (o, sin valor, una clave de compartir/imprimir/correo/chat/
     * PDF/XML por convención) saca la acción de la cabecera y la pone en la
     * barra secundaria del pie — salvo que el layout la haga primaria.
     */
    priority?: 'primary' | 'secondary'
    /** Estilo crítico: siempre va en la zona destructiva. */
    destructive?: boolean
    /** Se muestra deshabilitada con el motivo en lugar de desaparecer. */
    blockedWhen?: BlockRule | BlockRule[]
    /** Se oculta por completo cuando se cumple (p. ej. sin permiso o sin conector). */
    hiddenWhen?: When
}

/** Distribución de acciones para un estado (§5.4): 1 primaria, 2–3 secundarias, resto en «Más…». */
export interface ActionLayout {
    primary?: string
    secondary?: string[]
    more?: string[]
    destructive?: string[]
}

/** Regla: si `when` se cumple, se usa `layout`. Gana la primera que coincide. */
export interface ActionLayoutRule {
    when: When
    layout: ActionLayout
}

/** Botón inteligente con contador (estilo Odoo): navega a lo relacionado. */
export interface SmartButtonDef {
    key: string
    label: string
    icon?: string
    /** Fuente (`DocumentSourceDef.key`) cuyo total alimenta el contador; sin ella no hay contador. */
    source?: string
    /** Ruta de un valor del registro cuyo truthy activa el botón sin fuente (p. ej. «Pedido origen»). */
    field?: string
    /** Modelo destino para navegar a la lista filtrada. */
    href?: string
    /** No se muestra cuando el contador es 0 (por defecto se muestra deshabilitado). */
    hideWhenEmpty?: boolean
    /** Selecciona esta pestaña al hacer clic. */
    tab?: string
}

/** Consulta a un modelo relacionado con el registro (`{{id}}` se interpola). */
export interface DocumentSourceDef {
    key: string
    model: string
    /** Columna del modelo relacionado que apunta al registro. */
    foreignKey: string
    /** Filtros estáticos extra (`f_<col>=eq:<val>`). */
    where?: Record<string, string>
    limit?: number
    /**
     * Relación de dos saltos: en vez de filtrar por el id del registro, filtra
     * `foreignKey` con los valores de `field` de las filas de otra fuente ya
     * cargada (`via.source`). Ej.: los REP de una factura cuelgan del pago
     * (`source_id = payment_id`), y los pagos salen de las aplicaciones.
     */
    via?: { source: string; field: string }
}

export interface DocumentFieldDef {
    label: string
    /** Ruta en el contexto. */
    path: string
    format?: 'text' | 'money' | 'date' | 'datetime' | 'mono' | 'percent' | 'boolean'
    /** Ancho completo de la rejilla. */
    wide?: boolean
    /** Oculta el campo cuando el valor está vacío. */
    hideEmpty?: boolean
}

export interface DocumentFieldGroup {
    title?: string
    fields: DocumentFieldDef[]
}

export interface DocumentColumnDef {
    label: string
    path: string
    format?: DocumentFieldDef['format']
    /** Catálogo de estados (id de máquina registrada) para pintar un badge. */
    status?: string
}

export type DocumentTabDef =
    | { key: string; label: string; kind: 'fields'; groups: DocumentFieldGroup[] }
    | { key: string; label: string; kind: 'records'; source: string; columns: DocumentColumnDef[]; empty?: string }
    | { key: string; label: string; kind: 'slot'; slot: string; count?: string }

/** Métrica del encabezado (total, saldo, fechas…). */
export interface DocumentMetricDef extends DocumentFieldDef {
    tone?: 'default' | 'critical'
}

export interface DocumentSpec {
    /** Clave del modelo (`invoices`). */
    model: string
    /** Rutas candidatas para el título, en orden; `{{a}}{{b}}` se interpola. */
    title: string
    /** Texto bajo el título (cliente…). */
    subtitle?: DocumentFieldDef
    /** Campo que se copia con botón (UUID). */
    copyable?: DocumentFieldDef
    /** Badges independientes (fiscal, cobro…). */
    statuses: StatusMachine[]
    /** Catálogos extra que solo pintan celdas de pestañas (`column.status`), sin badge en la cabecera. */
    catalogs?: StatusMachine[]
    metrics?: DocumentMetricDef[]
    actions: DocumentActionDef[]
    layouts: ActionLayoutRule[]
    /** Layout si ninguna regla coincide. */
    defaultLayout?: ActionLayout
    smartButtons?: SmartButtonDef[]
    sources?: DocumentSourceDef[]
    tabs: DocumentTabDef[]
}

/** Contexto de evaluación: registro, fuentes cargadas y derivados. */
export interface DocumentContext {
    record: Record<string, unknown>
    /** Filas por fuente (`sources[key]`). */
    sources: Record<string, Record<string, unknown>[]>
    /** Total del servidor por fuente (`meta.total`); si falta, el contador usa el largo de `sources[key]`. */
    totals?: Record<string, number>
    /** Derivados (`$`). */
    derived: Record<string, unknown>
}

export interface ResolvedAction {
    def: DocumentActionDef
    /** Motivo cuando la acción está bloqueada. */
    blockedReason?: string
}

export interface ResolvedActionLayout {
    primary?: ResolvedAction
    secondary: ResolvedAction[]
    more: ResolvedAction[]
    destructive: ResolvedAction[]
    /** Secundarias (compartir, imprimir, correo…) → DocumentSecondaryBar, no la cabecera. */
    footer: ResolvedAction[]
}

export type DocumentSlotRenderer = (ctx: DocumentContext) => ReactNode
