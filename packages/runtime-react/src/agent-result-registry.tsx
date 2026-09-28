// Agent result renderer registry. An agent reply carries structured tool
// results (a record, a filtered view, a count, a chart, a plan of changes, a
// suggested action…) next to its prose. Each result declares a `kind`; the
// host renders it through whatever component is registered for that kind, so
// the chat never prints a raw tool payload and an addon can teach the chat
// to render its own results without touching the host:
//
//   import { registerAgentResultRenderer } from '@asteby/metacore-runtime-react'
//
//   registerAgentResultRenderer('record', RecordCard)              // any model
//   registerAgentResultRenderer('record', InvoiceCard, { model: 'invoices' })
//   registerAgentResultRenderer('shipment_quote', QuoteCard)       // addon kind
//
// Resolution is most specific first: `kind` + `model`, then `kind`. A result
// with no renderer renders nothing (never a JSON dump) unless the caller
// passes a fallback.
//
// Module-level singleton like the model-extension registry, but observable:
// federated addons register after the host has already painted, so views
// subscribe and re-render when a renderer lands.
import * as React from 'react'

/** A structured tool result shown under an agent reply. */
export interface AgentResult {
    /** Result type, e.g. record | view | count | chart | image | plan | proposal | action. */
    kind: string
    /** Model key the result belongs to, when it has one. */
    model?: string
    [key: string]: unknown
}

export interface AgentResultRendererProps<R extends AgentResult = AgentResult> {
    result: R
    /**
     * Interactive results (approve a plan, launch a guide) report back through
     * here; the host decides what an action means.
     */
    onAction?: (action: string, payload?: unknown) => void
    /** Host is processing an action for this result. */
    busy?: boolean
}

export type AgentResultRenderer<R extends AgentResult = AgentResult> = React.ComponentType<
    AgentResultRendererProps<R>
>

export interface AgentResultRendererOptions {
    /** Only for results of this model (overrides the generic renderer of the kind). */
    model?: string
}

const renderers = new Map<string, AgentResultRenderer<any>>()
const listeners = new Set<() => void>()
let version = 0

function keyOf(kind: string, model?: string): string {
    return model ? `${kind}:${model}` : kind
}

function emit(): void {
    version++
    listeners.forEach((l) => l())
}

/**
 * Registers the component that renders results of `kind` (optionally only
 * for one model). Returns an unregister function; a later registration for
 * the same key replaces the earlier one.
 */
export function registerAgentResultRenderer<R extends AgentResult = AgentResult>(
    kind: string,
    renderer: AgentResultRenderer<R>,
    options: AgentResultRendererOptions = {},
): () => void {
    const key = keyOf(kind, options.model)
    renderers.set(key, renderer)
    emit()
    return () => {
        if (renderers.get(key) === renderer) {
            renderers.delete(key)
            emit()
        }
    }
}

/** Most specific renderer for a result: kind+model, then kind. */
export function resolveAgentResultRenderer(
    result: Pick<AgentResult, 'kind' | 'model'>,
): AgentResultRenderer | undefined {
    if (!result?.kind) return undefined
    return (result.model && renderers.get(keyOf(result.kind, result.model))) || renderers.get(result.kind)
}

/** Registered keys (`kind` or `kind:model`), for diagnostics. */
export function listAgentResultRenderers(): string[] {
    return [...renderers.keys()]
}

export function clearAgentResultRenderers(): void {
    renderers.clear()
    emit()
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/** Re-renders the caller whenever a renderer is (un)registered. */
export function useAgentResultRegistryVersion(): number {
    return React.useSyncExternalStore(
        subscribe,
        () => version,
        () => version,
    )
}

export interface AgentResultViewProps extends AgentResultRendererProps {
    /** Rendered when no renderer matches. Defaults to nothing. */
    fallback?: React.ReactNode
}

/** Renders one agent result through the registry. */
export function AgentResultView({ result, fallback = null, ...rest }: AgentResultViewProps) {
    useAgentResultRegistryVersion()
    const Renderer = resolveAgentResultRenderer(result)
    if (!Renderer) return <>{fallback}</>
    return <Renderer result={result} {...rest} />
}
