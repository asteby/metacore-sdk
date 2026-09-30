import type {
    ActionLayout,
    DocumentActionDef,
    DocumentContext,
    DocumentSpec,
    Predicate,
    ResolvedAction,
    ResolvedActionLayout,
    StatusDef,
    StatusMachine,
    When,
} from './types'

/** Máximo de secundarias visibles; el resto pasa a «Más…» (§5.2 / §6.2). */
export const MAX_VISIBLE_SECONDARY = 3

/**
 * Lee una ruta del contexto. `$.x` son los derivados; `sources.k.length` es el
 * total de una fuente; el resto cuelga del registro (`record.x` o `x`).
 */
export function readPath(ctx: DocumentContext, path: string): unknown {
    if (!path) return undefined
    let parts = path.split('.')
    let cur: unknown
    if (parts[0] === '$') {
        cur = ctx.derived
        parts = parts.slice(1)
    } else if (parts[0] === 'sources') {
        cur = ctx.sources
        parts = parts.slice(1)
    } else {
        cur = ctx.record
        if (parts[0] === 'record') parts = parts.slice(1)
    }
    for (const p of parts) {
        if (cur == null) return undefined
        if (p === 'length' && Array.isArray(cur)) {
            cur = cur.length
            continue
        }
        cur = (cur as Record<string, unknown>)[p]
    }
    return cur
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a == null || b == null) return a == b
    return String(a) === String(b)
}

function isTruthy(v: unknown): boolean {
    if (v == null || v === false || v === '' || v === 0) return false
    if (Array.isArray(v)) return v.length > 0
    return true
}

function toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) ? n : NaN
}

export function evaluatePredicate(p: Predicate, ctx: DocumentContext): boolean {
    const v = readPath(ctx, p.field)
    switch (p.op) {
        case 'eq':
            return sameValue(v, p.value)
        case 'neq':
            return !sameValue(v, p.value)
        case 'in':
            return Array.isArray(p.value) && p.value.some((x) => sameValue(v, x))
        case 'not_in':
            return !(Array.isArray(p.value) && p.value.some((x) => sameValue(v, x)))
        case 'truthy':
            return isTruthy(v)
        case 'falsy':
            return !isTruthy(v)
        case 'gt':
            return toNumber(v) > toNumber(p.value)
        case 'gte':
            return toNumber(v) >= toNumber(p.value)
        case 'lt':
            return toNumber(v) < toNumber(p.value)
        case 'lte':
            return toNumber(v) <= toNumber(p.value)
        default:
            return false
    }
}

/** Un arreglo es un AND; sin condición siempre se cumple. */
export function evaluateWhen(when: When | undefined, ctx: DocumentContext): boolean {
    if (!when) return true
    const list = Array.isArray(when) ? when : [when]
    return list.every((p) => evaluatePredicate(p, ctx))
}

/** Estado actual de una máquina para el registro (o su fallback / un estado desconocido explícito). */
export function resolveStatus(machine: StatusMachine, ctx: DocumentContext): StatusDef | undefined {
    const raw = readPath(ctx, machine.field)
    const value = raw == null ? '' : String(raw)
    const found = machine.states.find((s) => s.value === value)
    if (found) return found
    if (machine.fallback) return machine.fallback
    if (!value) return undefined
    return { value, label: value, tone: 'neutral' }
}

/**
 * Distribución de acciones para el estado actual. Una acción `hiddenWhen` se
 * omite; una `blockedWhen` queda deshabilitada con motivo. Más de
 * `MAX_VISIBLE_SECONDARY` secundarias se derraman a «Más…»; una acción marcada
 * `destructive` siempre va a la zona destructiva aunque el layout la ponga en otro lado.
 */
export function resolveActions(spec: DocumentSpec, ctx: DocumentContext): ResolvedActionLayout {
    const byKey = new Map<string, DocumentActionDef>(spec.actions.map((a) => [a.key, a]))
    const layout: ActionLayout =
        spec.layouts.find((r) => evaluateWhen(r.when, ctx))?.layout ?? spec.defaultLayout ?? {}

    const resolve = (key: string | undefined): ResolvedAction | undefined => {
        if (!key) return undefined
        const def = byKey.get(key)
        if (!def || (def.hiddenWhen && evaluateWhen(def.hiddenWhen, ctx))) return undefined
        const rules = def.blockedWhen ? (Array.isArray(def.blockedWhen) ? def.blockedWhen : [def.blockedWhen]) : []
        const hit = rules.find((r) => evaluateWhen(r.when, ctx))
        return { def, blockedReason: hit?.reason }
    }
    const many = (keys: string[] | undefined) =>
        (keys ?? []).map(resolve).filter((a): a is ResolvedAction => !!a)

    const destructive = many(layout.destructive)
    const secondary: ResolvedAction[] = []
    const more: ResolvedAction[] = []
    for (const a of [...many(layout.secondary)]) {
        if (a.def.destructive) destructive.push(a)
        else secondary.push(a)
    }
    for (const a of many(layout.more)) {
        if (a.def.destructive) destructive.push(a)
        else more.push(a)
    }
    const overflow = secondary.splice(MAX_VISIBLE_SECONDARY)
    more.unshift(...overflow)

    let primary = resolve(layout.primary)
    if (primary?.def.destructive) {
        destructive.unshift(primary)
        primary = undefined
    }
    return { primary, secondary, more, destructive }
}

/** Interpola `{{campo}}` con valores del registro (sin evaluar código). */
export function interpolate(template: string, ctx: DocumentContext): string {
    return template.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_, path: string) => {
        const v = readPath(ctx, path)
        return v == null ? '' : String(v)
    })
}

/** Título: la interpolación puede dejar vacío el resultado; se prueban alternativas separadas por `||`. */
export function resolveTitle(template: string, ctx: DocumentContext): string {
    for (const alt of template.split('||')) {
        const out = interpolate(alt.trim(), ctx).trim()
        if (out) return out
    }
    return ''
}

/**
 * Quita del spec las acciones que dependen de una acción del modelo que el
 * backend (o el addon que la aporta) no declara: mejor un botón menos que uno
 * que abre un modal vacío. Las que resuelve la propia página (`href`/`openUrl`/`tab`) siempre se conservan.
 */
export function pruneUnavailableActions(spec: DocumentSpec, availableModelActions: Iterable<string>): DocumentSpec {
    const have = new Set(availableModelActions)
    return {
        ...spec,
        actions: spec.actions.filter((a) => a.href || a.openUrl || a.tab || have.has(a.modelAction ?? a.key)),
    }
}
