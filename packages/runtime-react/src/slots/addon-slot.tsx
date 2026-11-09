// AddonSlot — punto de montaje de contribuciones de addons en un host.
//
//   <AddonSlot kind="invoice.footer" context={{ invoiceId }} />
//
// Qué pinta, en este orden (`order` ascendente y luego `priority` descendente,
// ver docs/slot-priority.md):
//   1. contribuciones declaradas en los manifests instalados
//      (`contributions.slots[]`, ya filtradas por el servidor: permiso,
//      `condition` y org), que se bajan como remoto federado (`slot.entry` es
//      el `expose`);
//   2. contribuciones en proceso registradas en el slot store canónico
//      (`Registry.registerSlot`, `slotRegistry.register`): una sola lista.
//
// Cada contribución vive aislada en su propio ErrorBoundary + Suspense con un
// timeout: si un remoto lanza, se cuelga o no es compatible, emite
// `addon_slot_failed{addon,kind,reason}` por el canal de errores del host y
// muestra su fallback; sus hermanos y el shell no se enteran.
//
// Contrato del remoto (C2): `export default function SlotComponent({ context,
// props, sdk })`. Sin provider ni manifests, solo se pintan las contribuciones
// en proceso (equivale al `<Slot>` histórico).
import React, {
    createContext,
    Suspense,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ComponentType,
    type ReactNode,
} from 'react'
import { slotStore, type SlotEntry } from '@asteby/metacore-sdk'
import { loadFederatedModule } from '../addon-loader'
import { FederatedErrorBoundary } from '../federated-error-boundary'
import { useInstalledAddons } from '../installed-addons-context'
import { satisfiesSdkRange } from './sdk-range'

export const ADDON_SLOT_FAILED = 'addon_slot_failed'
export const DEFAULT_ADDON_SLOT_TIMEOUT_MS = 10_000

export type AddonSlotFailureReason =
    | 'timeout'
    | 'load'
    | 'render'
    | 'missing_expose'
    | 'integrity_required'
    | 'sdk_incompatible'

export interface AddonSlotFailure {
    addon: string
    kind: string
    reason: AddonSlotFailureReason
    /** Mensaje del error, si lo hubo. */
    message?: string
}

export type AddonSlotEventHandler = (event: typeof ADDON_SLOT_FAILED, data: AddonSlotFailure) => void

/** Subconjunto del manifest que AddonSlot necesita (cabe un `ManifestV3` completo). */
export interface AddonSlotManifest {
    key: string
    version?: string
    frontend?: {
        entry: string
        container?: string
        integrity?: string
        /** Rango semver del SDK con el que se compiló el bundle. */
        sdk?: string
    }
    contributions?: { slots?: AddonSlotContribution[] }
}

export interface AddonSlotContribution {
    slot_kind: string
    /** `expose` del remoto (p. ej. "./slots/invoice-footer"). */
    entry: string
    order?: number
    props?: Record<string, unknown>
    timeout_ms?: number
}

/** Lo que recibe el componente del remoto además de `context` y `props`. */
export interface AddonSlotSDK {
    addon: string
    kind: string
    /** Versión del SDK que el host expone a los remotos, si la declaró. */
    sdkVersion?: string
}

export interface AddonSlotComponentProps {
    context: Record<string, unknown>
    props: Record<string, unknown>
    sdk: AddonSlotSDK
}

interface Config {
    manifests: readonly AddonSlotManifest[]
    sdkVersion?: string
    requireIntegrity: boolean
    timeoutMs: number
    onEvent?: AddonSlotEventHandler
}

const Ctx = createContext<Config | null>(null)

export interface AddonSlotProviderProps {
    /** Manifests instalados, ya filtrados por el servidor. */
    manifests: readonly AddonSlotManifest[]
    /** Versión de `@asteby/metacore-sdk` que el host expone; habilita la comprobación de `frontend.sdk`. */
    sdkVersion?: string
    /** Rechaza remotos sin `frontend.integrity` (por omisión false = comportamiento histórico). */
    requireIntegrity?: boolean
    /** Timeout por omisión de carga de cada remoto (ms; 0 lo desactiva). */
    timeoutMs?: number
    /** Canal de errores del host (telemetría / incidentes). */
    onEvent?: AddonSlotEventHandler
    children?: ReactNode
}

export function AddonSlotProvider({
    manifests,
    sdkVersion,
    requireIntegrity = false,
    timeoutMs = DEFAULT_ADDON_SLOT_TIMEOUT_MS,
    onEvent,
    children,
}: AddonSlotProviderProps) {
    const onEventRef = useRef(onEvent)
    onEventRef.current = onEvent
    const value = useMemo<Config>(
        () => ({
            manifests,
            sdkVersion,
            requireIntegrity,
            timeoutMs,
            onEvent: (e, d) => onEventRef.current?.(e, d),
        }),
        [manifests, sdkVersion, requireIntegrity, timeoutMs],
    )
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export interface AddonSlotProps {
    kind: string
    context?: Record<string, unknown>
    className?: string
    /** Sustituye a la configuración del provider (timeout por omisión, ms). */
    timeoutMs?: number
    requireIntegrity?: boolean
    onEvent?: AddonSlotEventHandler
    /** Mientras un remoto baja. Por omisión nada. */
    loading?: ReactNode
    /** Qué se pinta en el lugar de una contribución que falló. Por omisión nada. */
    fallback?: ReactNode | ((failure: AddonSlotFailure) => ReactNode)
}

type RemoteItem_ = {
    type: 'remote'
    id: string
    addon: string
    order: number
    priority: number
    manifest: AddonSlotManifest
    slot: AddonSlotContribution
}
type LocalItem_ = { type: 'local'; id: string; addon: string; order: number; priority: number; entry: SlotEntry }
type Item = RemoteItem_ | LocalItem_

const EMPTY_OBJ: Record<string, unknown> = Object.freeze({}) as Record<string, unknown>

/** Orden canónico: `order` ascendente, luego `priority` descendente, luego inserción. */
export function sortSlotItems<T extends { order: number; priority: number }>(items: readonly T[]): T[] {
    return items
        .map((it, i) => ({ it, i }))
        .sort((a, b) => a.it.order - b.it.order || b.it.priority - a.it.priority || a.i - b.i)
        .map((x) => x.it)
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
    if (!ms || ms <= 0) return p
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(onTimeout()), ms)
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            },
        )
    })
}

class SlotLoadError extends Error {
    readonly reason: AddonSlotFailureReason
    constructor(reason: AddonSlotFailureReason, message: string) {
        super(message)
        this.name = 'SlotLoadError'
        this.reason = reason
    }
}

function containerScope(m: AddonSlotManifest): string {
    return m.frontend?.container || `metacore_${m.key.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function toComponent(mod: unknown): ComponentType<AddonSlotComponentProps> | null {
    const candidate = (mod as { default?: unknown } | null)?.default ?? mod
    if (typeof candidate === 'function') return candidate as ComponentType<AddonSlotComponentProps>
    // React.lazy / React.memo / forwardRef son objetos con $$typeof.
    if (candidate && typeof candidate === 'object' && '$$typeof' in (candidate as object)) {
        return candidate as ComponentType<AddonSlotComponentProps>
    }
    return null
}

type RemoteState =
    | { status: 'loading' }
    | { status: 'ready'; C: ComponentType<AddonSlotComponentProps> }
    | { status: 'failed'; failure: AddonSlotFailure }

function RemoteItem({
    kind,
    item,
    context,
    cfg,
    requireIntegrity,
    timeoutMs,
    loading,
    renderFallback,
    report,
}: {
    kind: string
    item: RemoteItem_
    context: Record<string, unknown>
    cfg: Config | null
    requireIntegrity: boolean
    timeoutMs: number
    loading: ReactNode
    renderFallback: (f: AddonSlotFailure) => ReactNode
    report: (f: AddonSlotFailure) => void
}) {
    const { manifest, slot, addon } = item
    const fe = manifest.frontend
    const [state, setState] = useState<RemoteState>({ status: 'loading' })
    const reportRef = useRef(report)
    reportRef.current = report
    const effectiveTimeout = slot.timeout_ms ?? timeoutMs
    const hostSdk = cfg?.sdkVersion

    useEffect(() => {
        let cancelled = false
        const fail = (reason: AddonSlotFailureReason, message: string) => {
            if (cancelled) return
            const failure: AddonSlotFailure = { addon, kind, reason, message }
            setState({ status: 'failed', failure })
            reportRef.current(failure)
        }
        setState({ status: 'loading' })
        if (!fe?.entry) {
            fail('load', `addon ${addon} declares a slot but has no frontend.entry`)
            return
        }
        if (requireIntegrity && !fe.integrity) {
            fail('integrity_required', `addon ${addon} has no frontend.integrity and the host requires it`)
            return
        }
        if (satisfiesSdkRange(hostSdk, fe.sdk) === false) {
            fail('sdk_incompatible', `addon ${addon} needs SDK ${fe.sdk}, host provides ${hostSdk}`)
            return
        }
        let loadPromise: Promise<unknown>
        try {
            loadPromise = Promise.resolve(loadFederatedModule(containerScope(manifest), fe.entry, slot.entry, fe.integrity))
        } catch (e) {
            loadPromise = Promise.reject(e)
        }
        withTimeout(
            loadPromise,
            effectiveTimeout,
            () => new SlotLoadError('timeout', `slot "${slot.entry}" of ${addon} did not load within ${effectiveTimeout} ms`),
        )
            .then((mod) => {
                if (cancelled) return
                const C = toComponent(mod)
                if (!C) throw new SlotLoadError('missing_expose', `expose "${slot.entry}" of ${addon} has no default component`)
                setState({ status: 'ready', C })
            })
            .catch((e: unknown) => {
                const err = e instanceof Error ? e : new Error(String(e))
                fail(e instanceof SlotLoadError ? e.reason : 'load', err.message)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addon, kind, fe?.entry, fe?.integrity, fe?.sdk, slot.entry, requireIntegrity, effectiveTimeout, hostSdk])

    if (state.status === 'loading') return <>{loading}</>
    if (state.status === 'failed') return <>{renderFallback(state.failure)}</>
    const { C } = state
    const sdk: AddonSlotSDK = { addon, kind, sdkVersion: hostSdk }
    return (
        <RenderGuard addon={addon} kind={kind} renderFallback={renderFallback} report={report} resetKey={fe?.entry}>
            <C context={context} props={slot.props ?? EMPTY_OBJ} sdk={sdk} />
        </RenderGuard>
    )
}

function RenderGuard({
    addon,
    kind,
    resetKey,
    renderFallback,
    report,
    children,
}: {
    addon: string
    kind: string
    resetKey?: unknown
    renderFallback: (f: AddonSlotFailure) => ReactNode
    report: (f: AddonSlotFailure) => void
    children: ReactNode
}) {
    return (
        <FederatedErrorBoundary
            addonKey={addon}
            resetKeys={[resetKey]}
            onError={(error) => report({ addon, kind, reason: 'render', message: error.message })}
            fallback={({ error }) => <>{renderFallback({ addon, kind, reason: 'render', message: error.message })}</>}
        >
            <Suspense fallback={null}>{children}</Suspense>
        </FederatedErrorBoundary>
    )
}

export function AddonSlot({
    kind,
    context,
    className,
    timeoutMs,
    requireIntegrity,
    onEvent,
    loading = null,
    fallback = null,
}: AddonSlotProps) {
    const cfg = useContext(Ctx)
    const installed = useInstalledAddons()
    const ctx = context ?? EMPTY_OBJ
    const local = useSyncExternalStore(
        (cb) => slotStore.subscribe(cb),
        () => slotStore.get(kind),
        () => slotStore.get(kind),
    )

    const items = useMemo(() => {
        const out: Item[] = []
        for (const m of cfg?.manifests ?? []) {
            if (installed && !installed.addons.has(m.key)) continue
            ;(m.contributions?.slots ?? []).forEach((slot, i) => {
                if (slot.slot_kind !== kind) return
                out.push({
                    type: 'remote',
                    id: `${m.key}:${slot.entry}:${i}`,
                    addon: m.key,
                    order: slot.order ?? 0,
                    priority: 0,
                    manifest: m,
                    slot,
                })
            })
        }
        local.forEach((entry, i) => {
            if (entry.owner && installed && !installed.addons.has(entry.owner)) return
            out.push({
                type: 'local',
                id: `local:${entry.source ?? 'anon'}:${i}`,
                addon: entry.owner ?? entry.source ?? 'host',
                order: 0,
                priority: entry.priority ?? 0,
                entry,
            })
        })
        return sortSlotItems(out)
    }, [cfg?.manifests, installed, local, kind])

    const effTimeout = timeoutMs ?? cfg?.timeoutMs ?? DEFAULT_ADDON_SLOT_TIMEOUT_MS
    const effRequire = requireIntegrity ?? cfg?.requireIntegrity ?? false
    const handlerRef = useRef(onEvent ?? cfg?.onEvent)
    handlerRef.current = onEvent ?? cfg?.onEvent

    const report = useRef((f: AddonSlotFailure) => {
        try {
            handlerRef.current?.(ADDON_SLOT_FAILED, f)
        } catch {
            /* un reporter roto no tumba el shell */
        }
    }).current
    const renderFallback = (f: AddonSlotFailure): ReactNode =>
        typeof fallback === 'function' ? (fallback as (f: AddonSlotFailure) => ReactNode)(f) : fallback

    if (items.length === 0) return null
    return (
        <div data-addon-slot={kind} className={className} style={className ? undefined : { display: 'contents' }}>
            {items.map((item) => (
                <div key={item.id} data-addon-slot-item={item.addon} style={{ display: 'contents' }}>
                    {item.type === 'remote' ? (
                        <RemoteItem
                            kind={kind}
                            item={item}
                            context={ctx}
                            cfg={cfg}
                            requireIntegrity={effRequire}
                            timeoutMs={effTimeout}
                            loading={loading}
                            renderFallback={renderFallback}
                            report={report}
                        />
                    ) : (
                        <RenderGuard addon={item.addon} kind={kind} renderFallback={renderFallback} report={report}>
                            <item.entry.component
                                {...ctx}
                                context={ctx}
                                props={EMPTY_OBJ}
                                sdk={{ addon: item.addon, kind, sdkVersion: cfg?.sdkVersion } satisfies AddonSlotSDK}
                            />
                        </RenderGuard>
                    )}
                </div>
            ))}
        </div>
    )
}
