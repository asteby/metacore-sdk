// <Seam> — punto de extensión tipado. El anfitrión publica el contrato (lentes con
// clase de datos, campos escribibles, intenciones) y Seam monta los injertos que
// lo cumplen: cada uno aislado (error boundary + Suspense + carga perezosa), con
// sólo las lentes que declaró y un `propose` atenuado a sus `writes`.
import {
    lazy,
    Suspense,
    useCallback,
    useMemo,
    useRef,
    useSyncExternalStore,
    type ComponentType,
    type LazyExoticComponent,
    type ReactNode,
} from 'react'
import { FederatedErrorBoundary } from '../federated-error-boundary'
import { useCan } from '../permissions-context'
import { useLoomConfig } from './provider'
import { attenuatePatch, effectiveApply, projectLenses, redactMessage, resolveSeam, sensitiveClasses } from './resolve'
import { getPart, listGrafts, loomVersion, subscribeLoom } from './store'
import type {
    GraftCapabilities,
    GraftComponent,
    GraftDef,
    GraftModule,
    LoomEvent,
    ProposalInput,
    Proposal,
    ResolvedSeam,
    SeamContract,
} from './types'

export interface SeamHostContext {
    model?: string
    mode?: string
}

/** Injertos de un seam ya resueltos (montados + descartados con motivo). */
export function useSeam(contract: SeamContract, host: SeamHostContext = {}): ResolvedSeam {
    const cfg = useLoomConfig()
    const can = useCan()
    const v = useSyncExternalStore(subscribeLoom, loomVersion, loomVersion)
    return useMemo(() => {
        const local = listGrafts(contract.id)
        const byId = new Map<string, GraftDef>()
        for (const g of local) byId.set(g.id, g)
        // Lo servido manda en metadatos (orden, props); el código local aporta el componente.
        for (const s of cfg?.grafts ?? []) {
            if (s.seam !== contract.id) continue
            const l = byId.get(s.id)
            byId.set(s.id, l ? { ...l, ...s, component: l.component, load: s.load ?? l.load, part: s.part ?? l.part } : s)
        }
        const granted = cfg?.serverAuthoritative ? new Set((cfg.grafts ?? []).map((g) => g.id)) : undefined
        return resolveSeam(contract, [...byId.values()], {
            can,
            flags: cfg?.flags,
            settings: cfg?.settings,
            model: host.model,
            mode: host.mode,
            granted,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contract, cfg, can, host.model, host.mode, v])
}

const lazyCache = new WeakMap<() => Promise<GraftModule>, LazyExoticComponent<ComponentType<any>>>()

function toLazy(load: () => Promise<GraftModule>): LazyExoticComponent<ComponentType<any>> {
    let c = lazyCache.get(load)
    if (!c) {
        c = lazy(async () => {
            const mod = await load()
            const C = (mod as { default?: GraftComponent }).default ?? mod
            if (typeof C !== 'function' && !(C && typeof C === 'object' && '$$typeof' in C)) {
                throw new Error('el módulo del injerto no exporta un componente')
            }
            return { default: C as ComponentType<any> }
        })
        lazyCache.set(load, c)
    }
    return c
}

function componentOf(g: GraftDef): ComponentType<any> | null {
    if (g.component) return g.component
    if (g.load) return toLazy(g.load)
    const p = g.part ? getPart(g.part) : undefined
    if (p?.component) return p.component
    if (p?.load) return toLazy(p.load)
    return null
}

export interface SeamProps {
    contract: SeamContract
    /** Valores de las lentes del contrato. */
    lenses: Readonly<Record<string, unknown>>
    host?: SeamHostContext
    /** Recibe las propuestas ya atenuadas. Sin él, el seam no acepta propuestas. */
    onProposal?: (p: Proposal) => void
    /** Atiende una intención; devuelve true si la manejó. */
    onIntent?: (intent: string, payload: unknown, graft: GraftDef) => boolean
    /** Mientras un injerto perezoso baja. */
    loading?: ReactNode
    className?: string
}

let proposalSeq = 0

function GraftMount({
    graft,
    contract,
    lenses,
    onProposal,
    onIntent,
    loading,
    report,
}: {
    graft: GraftDef
    contract: SeamContract
    lenses: Readonly<Record<string, unknown>>
    onProposal?: (p: Proposal) => void
    onIntent?: SeamProps['onIntent']
    loading: ReactNode
    report: (e: LoomEvent) => void
}) {
    const can = useCan()
    const addon = graft.addon ?? graft.id.split('.')[0] ?? 'host'
    const C = useMemo(() => componentOf(graft), [graft])
    const view = useMemo(() => projectLenses(lenses, graft.reads), [lenses, graft.reads])
    const classes = useMemo(() => sensitiveClasses(contract, graft.reads), [contract, graft.reads])
    const live = useRef({ onProposal, onIntent, report })
    live.current = { onProposal, onIntent, report }

    const propose = useCallback(
        (input: ProposalInput) => {
            const { allowed, dropped } = attenuatePatch(input.patch, graft.writes, contract.writable)
            if (dropped.length) {
                live.current.report({ type: 'proposal_dropped_keys', seam: contract.id, graft: graft.id, addon, keys: dropped })
            }
            if (!Object.keys(allowed).length || !live.current.onProposal) return
            const selfReview = !!(graft.selfReview || (graft.part && getPart(graft.part)?.selfReview))
            live.current.onProposal({
                ...input,
                apply: effectiveApply(input.apply, selfReview, Object.keys(allowed), contract.fieldClasses),
                patch: allowed,
                id: `${graft.id}#${++proposalSeq}`,
                graft: graft.id,
                addon,
                previous: {},
                dropped,
            })
        },
        [graft, contract.id, contract.writable, contract.fieldClasses, addon],
    )
    const emit = useCallback(
        (intent: string, payload?: unknown) => {
            if (!contract.intents?.includes(intent)) return false
            // Una intención que lleva un parche (`record.edit`) sigue la misma regla de `apply` que `propose`.
            let out = payload
            const p = payload as { patch?: Record<string, unknown>; apply?: 'review' | 'auto' } | null
            if (p && typeof p === 'object' && p.apply === 'auto') {
                const selfReview = !!(graft.selfReview || (graft.part && getPart(graft.part)?.selfReview))
                out = { ...p, apply: effectiveApply('auto', selfReview, Object.keys(p.patch ?? {}), contract.fieldClasses) }
            }
            return live.current.onIntent?.(intent, out, graft) ?? false
        },
        [contract.intents, contract.fieldClasses, graft],
    )
    const caps = useMemo<GraftCapabilities>(() => ({ propose, emit, can }), [propose, emit, can])
    const meta = useMemo(() => ({ id: graft.id, addon, seam: contract.id }), [graft.id, addon, contract.id])

    if (!C) return null
    return (
        <div data-loom-graft={graft.id} data-loom-addon={addon} style={{ display: 'contents' }}>
            <FederatedErrorBoundary
                addonKey={addon}
                onError={(err) =>
                    report({
                        type: 'graft_failed',
                        seam: contract.id,
                        graft: graft.id,
                        addon,
                        reason: 'render',
                        message: redactMessage(err.message, classes),
                    })
                }
                // Falla en silencio: el anfitrión sigue igual que sin el injerto.
                fallback={() => null}
            >
                <Suspense fallback={loading}>
                    <C lenses={view} props={graft.props ?? EMPTY} caps={caps} graft={meta} />
                </Suspense>
            </FederatedErrorBoundary>
        </div>
    )
}

const EMPTY: Record<string, unknown> = Object.freeze({}) as Record<string, unknown>

export function Seam({ contract, lenses, host, onProposal, onIntent, loading = null, className }: SeamProps) {
    const cfg = useLoomConfig()
    const resolved = useSeam(contract, host)
    const report = useCallback((e: LoomEvent) => cfg?.onEvent?.(e), [cfg])
    if (!resolved.mounted.length && !cfg?.inspect) return null
    return (
        <div data-loom-seam={contract.id} data-loom-seam-version={contract.version} className={className} style={className ? undefined : { display: 'contents' }}>
            {resolved.mounted.map((g) => (
                <GraftMount
                    key={g.id}
                    graft={g}
                    contract={contract}
                    lenses={lenses}
                    onProposal={onProposal}
                    onIntent={onIntent}
                    loading={loading}
                    report={report}
                />
            ))}
            {cfg?.inspect ? <SeamInspector contract={contract} resolved={resolved} /> : null}
        </div>
    )
}

/** Inspector de desarrollo: qué llena el seam y por qué lo demás no se montó. */
export function SeamInspector({ contract, resolved }: { contract: SeamContract; resolved: ResolvedSeam }) {
    return (
        <details data-loom-inspector={contract.id} className="rounded border border-dashed border-primary/50 px-2 py-1 text-[11px] text-muted-foreground">
            <summary>
                {contract.id}@{contract.version} · {resolved.mounted.length} montados · {resolved.skipped.length} no
            </summary>
            <ul>
                {resolved.mounted.map((g) => (
                    <li key={g.id}>montado: {g.id}</li>
                ))}
                {resolved.skipped.map((s) => (
                    <li key={s.graft.id}>
                        no montado: {s.graft.id}: {s.reason}
                        {s.detail ? ` (${s.detail})` : ''}
                    </li>
                ))}
            </ul>
        </details>
    )
}
