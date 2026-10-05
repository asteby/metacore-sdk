// Registro de contribuciones federadas — cómo un addon mete secciones,
// columnas, modales, fuentes de «Cargar desde» y vistas previas en la pantalla
// de OTRO addon sin que ese addon lo conozca.
//
// Se monta sobre slotRegistry (slot.tsx) — no es un segundo sistema: cada
// contribución es un SlotEntry con id canónico `doc:<kind>:<region>` — y añade
// lo que slot no tiene: `requiresAddon` (se oculta solo si el addon no está
// instalado o se desinstala en caliente), orden estable, `when` por documento y
// carga perezosa del componente (import() del remote federado).
//
// Contrato estable para remotes federados: los tipos de este archivo. Todo
// `register*` devuelve un disposer; el AddonLoader lo llama al desmontar o
// recargar el remote y la contribución desaparece sin recargar la página.
import { createElement, lazy, Suspense, type ComponentType } from 'react'
import { slotRegistry } from '../slot'

/** Regiones del DocumentEditor/DocumentPage donde se puede contribuir. */
export type DocumentRegion =
    | 'header.fields' // campos extra del encabezado (Uso CFDI, Método, Forma…)
    | 'party.card' // filas extra en PartyCard (RFC, régimen, CP, CSF)
    | 'lines.columns' // columnas de LinesGrid (clave SAT, DOT, almacén)
    | 'side.panels' // paneles laterales (Revisión, PreviewPanel, crédito)
    | 'body.sections' // secciones bajo los renglones (Reingreso a stock, Relación CFDI)
    | 'footer.actions' // botones del ActionBar (Timbrar, Pedir autorización)

export interface DocumentEditorContext {
    kind: string // 'invoice' | 'credit_note' | 'payment' | 'purchase_order' | …
    model: string // 'customers.Invoice'
    values: Record<string, unknown>
    mode: 'create' | 'edit' | 'view'
}

export interface DocumentContribution<P = DocumentContributionProps> {
    /** Id estable `addon.region.name` (dedupe y orden). Re-registrar el mismo id reemplaza. */
    id: string
    kinds: string[] | '*'
    region: DocumentRegion
    /** Addon dueño. Si no está instalado, no se renderiza (y el server revalida). */
    requiresAddon?: string
    /** Mayor = primero. Default 0. */
    priority?: number
    when?: (ctx: DocumentEditorContext) => boolean
    /** Componente o loader perezoso del remote (`() => import('fiscal_mexico/CfdiSection')`). */
    component?: ComponentType<P>
    load?: () => Promise<{ default: ComponentType<P> }>
}

/**
 * Contribución resuelta: `component` siempre presente (si se registró con
 * `load`, es un envoltorio lazy + Suspense que no pinta nada mientras carga).
 */
export type ResolvedDocumentContribution<P = DocumentContributionProps> = DocumentContribution<P> & {
    component: ComponentType<P>
}

export interface DocumentContributionProps {
    ctx: DocumentEditorContext
    setValue: (key: string, value: unknown) => void
    issues: { report: (key: string, issue: { severity: 'error' | 'warning'; message: string }) => void }
}

/** Predicado «¿está instalado?»; `useInstalledAddons` lo arma en React. */
export type IsAddonInstalled = (addonKey: string) => boolean

interface Entry {
    c: ResolvedDocumentContribution<any>
    dispose: () => void
}

const contribs = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

function notify() {
    version += 1
    for (const l of [...listeners]) l()
}

/** Suscripción para useSyncExternalStore (contribuciones y modales). */
export function subscribeContributions(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/** Versión monotónica: cambia en cada register/dispose. */
export function contributionsVersion(): number {
    return version
}

export function slotIdFor(kind: string, region: DocumentRegion): string {
    return `doc:${kind}:${region}`
}

/** `load` → componente lazy envuelto en Suspense (fallback vacío: sin saltos de layout). */
function lazyComponent<P>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
    const Lazy = lazy(load) as unknown as ComponentType<any>
    return (props: P) => createElement(Suspense, { fallback: null }, createElement(Lazy, props as any))
}

/**
 * Registra la contribución y la publica en slotRegistry bajo cada `doc:<kind>:<region>`
 * (kinds '*' → `doc:*:<region>`). Devuelve el disposer: AddonLoader lo llama al
 * desmontar o recargar el remote (fiber), así la sección desaparece al desinstalar.
 * Re-registrar el mismo `id` (recarga en caliente) reemplaza la anterior.
 */
export function registerDocumentContribution<P = DocumentContributionProps>(c: DocumentContribution<P>, source?: string): () => void {
    if (!c.component && !c.load) throw new Error(`contribution ${c.id}: component o load es obligatorio`)
    contribs.get(c.id)?.dispose()
    const resolved = { ...c, component: c.component ?? lazyComponent(c.load!) } as ResolvedDocumentContribution<any>
    const kinds = c.kinds === '*' ? ['*'] : c.kinds
    const slotDisposers = kinds.map(k =>
        slotRegistry.register(slotIdFor(k, c.region), resolved.component as ComponentType, {
            priority: c.priority ?? 0,
            source: source ?? c.requiresAddon ?? c.id,
        }),
    )
    let disposed = false
    const entry: Entry = {
        c: resolved,
        dispose: () => {
            if (disposed) return
            disposed = true
            slotDisposers.forEach(d => d())
            if (contribs.get(c.id) === entry) contribs.delete(c.id)
            notify()
        },
    }
    contribs.set(c.id, entry)
    notify()
    return entry.dispose
}

/**
 * Contribuciones aplicables a `region` para el documento `ctx`, ordenadas por
 * prioridad (desc) y luego id. Pura: no lee React; `useDocumentContributions`
 * la envuelve con useInstalledAddons.
 */
export function resolveContributions(
    ctx: DocumentEditorContext,
    region: DocumentRegion,
    isInstalled: IsAddonInstalled,
): ResolvedDocumentContribution<any>[] {
    return [...contribs.values()]
        .map(e => e.c)
        .filter(c => c.region === region)
        .filter(c => c.kinds === '*' || c.kinds.includes(ctx.kind))
        .filter(c => !c.requiresAddon || isInstalled(c.requiresAddon))
        .filter(c => !c.when || c.when(ctx))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
}

// ---- Modales federados ------------------------------------------------------
// ActionModalDispatcher resuelve `modal: "returns.settle_method"` con
// requestFederatedAction (espera hasta 20 s). Este registro es su contraparte
// declarativa: el addon registra la clave al cargar. Si el addon dueño no está
// instalado, resolveFederatedModal devuelve null de inmediato y el dispatcher
// usa el formulario genérico de la acción en vez de colgarse esperando.

export interface FederatedModal<P = any> {
    /** Clave `<addon>.<nombre>`, la misma que `modal` en el manifest. */
    key: string // 'fiscal_mexico.import_cfdi'
    addon: string
    /** El dispatcher le pasa ActionModalProps (open, onOpenChange, action, model, record…). */
    load: () => Promise<{ default: ComponentType<P> }>
}

const modals = new Map<string, FederatedModal>()
const modalComponents = new WeakMap<FederatedModal, ComponentType<any>>()

export function registerFederatedModal(m: FederatedModal): () => void {
    modals.set(m.key, m)
    notify()
    return () => {
        if (modals.get(m.key) === m) {
            modals.delete(m.key)
            notify()
        }
    }
}

/** null si el modal no está registrado o su addon no está instalado. Nunca espera. */
export function resolveFederatedModal(key: string, isInstalled: IsAddonInstalled): FederatedModal | null {
    const m = modals.get(key)
    return m && isInstalled(m.addon) ? m : null
}

/**
 * Componente `React.lazy` del modal resuelto, memoizado por registro (no se
 * re-crea en cada render). Quien lo pinta lo envuelve en `<Suspense>`.
 */
export function federatedModalComponent<P = any>(m: FederatedModal<P>): ComponentType<P> {
    let C = modalComponents.get(m)
    if (!C) {
        C = lazy(m.load) as unknown as ComponentType<any>
        modalComponents.set(m, C)
    }
    return C as ComponentType<P>
}

/** Solo para tests. */
export function __resetContributions(): void {
    for (const e of [...contribs.values()]) e.dispose()
    contribs.clear()
    modals.clear()
    notify()
}
