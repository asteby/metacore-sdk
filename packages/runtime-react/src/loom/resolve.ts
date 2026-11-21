// Resolución pura de un seam: qué injertos se montan, en qué orden y por qué
// los demás no. Sin React: la usan <Seam>, el inspector y las pruebas de contrato.
import { satisfiesSdkRange } from '../slots/sdk-range'
import { getPart } from './store'
import type { DataClass, GraftDef, LoomEnv, ResolvedSeam, SeamContract, SkippedGraft } from './types'

const bare = (model: string) => model.split('.').pop() ?? model
const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])

function hasComponent(g: GraftDef): boolean {
    if (g.component || g.load) return true
    if (!g.part) return false
    const p = getPart(g.part)
    return !!(p && (p.component || p.load))
}

function check(g: GraftDef, contract: SeamContract, env: LoomEnv): SkippedGraft | null {
    const skip = (reason: SkippedGraft['reason'], detail?: string): SkippedGraft => ({ graft: g, reason, detail })
    if (env.granted && !env.granted.has(g.id)) return skip('not_granted', 'el servidor no lo listó para este usuario')
    if (g.requires && satisfiesSdkRange(contract.version, g.requires) === false) {
        return skip('version', `pide ${contract.id}@${g.requires}, el anfitrión publica ${contract.version}`)
    }
    const w = g.when
    if (w) {
        const missing = asList(w.permission).filter((p) => !env.can(p))
        if (missing.length) return skip('permission', missing.join(', '))
        if (w.anyPermission?.length && !w.anyPermission.some((p) => env.can(p))) {
            return skip('permission', `alguno de ${w.anyPermission.join(', ')}`)
        }
        if (w.flag && !env.flags?.has(w.flag)) return skip('flag', w.flag)
        if (w.setting) {
            const v = env.settings?.[w.setting.key]
            const ok = 'equals' in w.setting ? Object.is(v, w.setting.equals) : !!v
            if (!ok) return skip('setting', w.setting.key)
        }
        if (w.model?.length) {
            const m = env.model ? bare(env.model) : undefined
            if (!m || !w.model.some((x) => bare(x) === m)) return skip('model', env.model ?? '(sin modelo)')
        }
        if (w.mode?.length && (!env.mode || !w.mode.includes(env.mode))) return skip('mode', env.mode ?? '(sin modo)')
    }
    if (!hasComponent(g)) return skip('no_component', g.part ? `Part ${g.part} no registrado` : undefined)
    return null
}

/** Orden canónico: `order` ascendente, luego orden de entrada (estable). */
export function resolveSeam(contract: SeamContract, candidates: readonly GraftDef[], env: LoomEnv): ResolvedSeam {
    const mounted: GraftDef[] = []
    const skipped: SkippedGraft[] = []
    for (const g of candidates) {
        if (g.seam !== contract.id) continue
        const s = check(g, contract, env)
        if (s) skipped.push(s)
        else mounted.push(g)
    }
    const indexed = mounted.map((g, i) => ({ g, i }))
    indexed.sort((a, b) => (a.g.order ?? 0) - (b.g.order ?? 0) || a.i - b.i)
    return { mounted: indexed.map((x) => x.g), skipped }
}

/** `fiscal_data.*` cubre `fiscal_data.rfc`; un nombre exacto, sólo a sí mismo. */
export function matchesWrite(key: string, patterns: readonly string[]): boolean {
    return patterns.some((p) => (p.endsWith('.*') ? key.startsWith(p.slice(0, -1)) : p === key))
}

/**
 * Atenúa un parche: sólo pasan claves que el injerto declaró en `writes` Y que el seam
 * acepta (`writable`). Sin `writes`, el injerto no escribe nada.
 */
export function attenuatePatch(
    patch: Record<string, unknown>,
    writes: readonly string[] | undefined,
    writable: ReadonlySet<string> | undefined,
): { allowed: Record<string, unknown>; dropped: string[] } {
    const allowed: Record<string, unknown> = {}
    const dropped: string[] = []
    for (const [k, v] of Object.entries(patch ?? {})) {
        if (writable && writable.has(k) && writes && matchesWrite(k, writes)) allowed[k] = v
        else dropped.push(k)
    }
    return { allowed, dropped }
}

/** Sólo las lentes declaradas, congeladas (una lente no declarada no existe para el injerto). */
export function projectLenses(
    lenses: Readonly<Record<string, unknown>>,
    reads: readonly string[] | undefined,
): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    for (const k of reads ?? []) if (k in lenses) out[k] = freeze(snapshot(lenses[k]))
    return Object.freeze(out)
}

/**
 * Copia para congelar sin tocar el estado del anfitrión. Objetos planos y arrays se copian en
 * profundidad; el resto (File, Date, instancias) pasa tal cual y no se congela.
 */
function snapshot<T>(v: T): T {
    if (Array.isArray(v)) return v.map(snapshot) as T
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        const o: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(v as object)) o[k] = snapshot(x)
        return o as T
    }
    return v
}

function freeze<T>(v: T): T {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) return v
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
        Object.freeze(v)
        for (const x of Object.values(v as object)) freeze(x)
    }
    return v
}

export { effectiveApply } from './apply'

const SENSITIVE: ReadonlySet<DataClass> = new Set<DataClass>(['pii', 'pii.fiscal', 'secret'])

/** Clases sensibles que un injerto lee: si hay alguna, sus errores salen redactados. */
export function sensitiveClasses(contract: SeamContract, reads: readonly string[] | undefined): DataClass[] {
    const out = new Set<DataClass>()
    for (const r of reads ?? []) {
        const c = contract.lenses[r]
        if (c && SENSITIVE.has(c)) out.add(c)
    }
    return [...out]
}

/**
 * Mensaje apto para telemetría. Un injerto que leyó datos sensibles puede haberlos metido en el
 * mensaje de error (p. ej. `RFC XAXX010101000 inválido`): se sustituye entero.
 */
export function redactMessage(message: string, classes: readonly DataClass[]): string {
    if (!classes.length) return message
    return `[redactado: ${classes.join(',')}]`
}
