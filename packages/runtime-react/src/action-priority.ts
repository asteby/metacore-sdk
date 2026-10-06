// Clasificación primaria / secundaria de acciones — puro (sin React), lo usan
// el menú de fila, la cabecera/pie del documento y resolveActions del
// DocumentPage. Ver record-actions.ts para las acciones aportadas por addons.
import type { ActionPriority } from '@asteby/metacore-sdk'
import type { InstalledAddonsValue } from './installed-addons-context'

export type { ActionPriority }

/** Lo mínimo que se lee de una acción de metadata para clasificarla. */
export interface PrioritizableAction {
    key: string
    priority?: string
    trigger?: { type?: string; capability?: string } | null
}

// Segmentos de la clave (separados por _ . -) que marcan una acción de
// compartir/salida. Por segmento: `create_mailbox` no es «mail», `send` solo
// (enviar una cotización) sigue siendo flujo principal.
const SECONDARY_SEGMENTS = new Set([
    'print',
    'reprint',
    'share',
    'email',
    'mail',
    'whatsapp',
    'chat',
    'download',
    'pdf',
    'xml',
    'acuse',
])

const CRUD_KEYS = new Set(['view', 'edit', 'delete'])

/** "primary" | "secondary" | undefined (= acción normal del menú). */
export function classifyActionPriority(action: PrioritizableAction): ActionPriority | undefined {
    if (action.priority === 'primary' || action.priority === 'secondary') return action.priority
    if (CRUD_KEYS.has(action.key)) return undefined
    return action.key
        .toLowerCase()
        .split(/[_.-]+/)
        .some((seg) => SECONDARY_SEGMENTS.has(seg))
        ? 'secondary'
        : undefined
}

export interface SplitActions<A> {
    /** La única destacada (la primera que se declara `primary`). */
    primary?: A
    /** El resto de acciones principales, en orden. */
    main: A[]
    /** Compartir / imprimir / correo / chat… */
    secondary: A[]
}

/**
 * Separa primaria, principales y secundarias conservando el orden. Si varias
 * reclaman `primary`, sólo la primera lo es; las demás quedan como principales.
 */
export function splitActionsByPriority<A extends PrioritizableAction>(actions: readonly A[]): SplitActions<A> {
    let primary: A | undefined
    const main: A[] = []
    const secondary: A[] = []
    for (const a of actions) {
        const p = classifyActionPriority(a)
        if (p === 'secondary') secondary.push(a)
        else if (p === 'primary' && !primary) primary = a
        else main.push(a)
    }
    return { primary, main, secondary }
}

/**
 * Una acción que despacha por capacidad (`trigger.type: "capability"`) sólo se
 * ofrece si algún addon instalado la provee. Sin provider = desconocido → se
 * muestra (el servidor revalida igual).
 */
export function isActionProviderActive(action: PrioritizableAction, installed: InstalledAddonsValue | null): boolean {
    const t = action.trigger
    if (!installed || !t || t.type !== 'capability' || !t.capability) return true
    return installed.capabilities.has(t.capability)
}
