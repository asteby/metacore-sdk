// ModelActionToolbar — renders page-level (toolbar) triggers for a model's
// declarative actions and owns the modal dispatch for them.
//
// A model's actions carry a `placement` hint (see manifest/v3 Action.placement):
//   "row" (default) — rendered per-row inside <DynamicTable>'s action column.
//   "table"         — a plain toolbar button (no record context).
//   "create"        — a primary toolbar button that replaces the generic
//                     "create" button, for addons shipping a custom create
//                     experience (e.g. a journal entry with debit/credit lines).
//
// This component renders the buttons for the placements it's asked to surface
// (default: table + create) and mounts the <ActionModalDispatcher>, which
// resolves either a custom federated modal (registered via the action registry)
// or the generic declarative form. For create-style actions there is no record
// yet, so the dispatcher receives an empty record `{}`.
//
// It is the single generic primitive every host consumes — DynamicCRUDPage uses
// it internally, and bespoke host pages (e.g. ops `/m/$model`) mount it directly
// next to their own toolbar. Hosts never reimplement action-button plumbing.
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@asteby/metacore-ui/primitives'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { DynamicIcon } from './dynamic-icon'
import { ActionModalDispatcher } from './action-modal-dispatcher'
import { useCan, modelCapability } from './permissions-context'
import type { ActionDefinition, ActionMetadata, TableMetadata } from './types'

export type ActionPlacement = 'row' | 'table' | 'create'

export interface ModelActionToolbarProps {
    /** Model key as registered on the backend (e.g. "JournalEntry"). */
    model: string
    /** Data endpoint passed to the dispatcher. Defaults to `/data/<model>/me`. */
    endpoint?: string
    /**
     * Pre-fetched action definitions. When omitted the toolbar reads them from
     * the metadata cache, falling back to `/metadata/table/<model>`. Pass this
     * when the host page already holds the metadata to avoid a second fetch.
     */
    actions?: ActionDefinition[]
    /** Which placements to render. Defaults to `['table', 'create']`. */
    placements?: ActionPlacement[]
    /** Fired after an action's modal reports success. */
    onChange?: () => void
    /** Extra classes on the button row container. */
    className?: string
}

const DEFAULT_PLACEMENTS: ActionPlacement[] = ['table', 'create']

function toActionMetadata(a: ActionDefinition): ActionMetadata {
    return {
        key: a.key,
        label: a.label,
        icon: a.icon || 'Zap',
        color: a.color,
        confirm: a.confirm,
        confirmMessage: a.confirmMessage,
        fields: a.fields,
        requiresState: a.requiresState,
        executable: a.executable,
        placement: a.placement,
    }
}

/**
 * Returns the model's actions matching the requested placements. Reads from the
 * `actions` prop when provided, else the metadata cache, else fetches once.
 */
export function useModelActions(
    model: string,
    placements: ActionPlacement[] = DEFAULT_PLACEMENTS,
    provided?: ActionDefinition[],
): ActionDefinition[] {
    const api = useApi()
    const cached = useMetadataCache((s) => s.getMetadata(model))
    const [fetched, setFetched] = useState<TableMetadata | null>(null)

    const haveSource = provided != null || cached != null
    useEffect(() => {
        if (haveSource) return
        let cancelled = false
        api
            .get(`/metadata/table/${model}`)
            .then((res) => {
                if (!cancelled) setFetched((res.data?.data ?? res.data) as TableMetadata)
            })
            .catch(() => {
                if (!cancelled) setFetched(null)
            })
        return () => {
            cancelled = true
        }
    }, [model, haveSource, api])

    const all = provided ?? cached?.actions ?? fetched?.actions ?? []
    return useMemo(
        () => all.filter((a) => placements.includes((a.placement ?? 'row') as ActionPlacement)),
        [all, placements],
    )
}

export function ModelActionToolbar({
    model,
    endpoint,
    actions,
    placements = DEFAULT_PLACEMENTS,
    onChange,
    className,
}: ModelActionToolbarProps) {
    const all = useModelActions(model, placements, actions)
    // Capability gating — always-true without a <PermissionsProvider>. Custom
    // table/create actions map onto `lowercase(model).<action_key>`.
    const can = useCan()
    const surfaced = useMemo(
        () => all.filter((a) => can(modelCapability(model, a.key))),
        [all, can, model],
    )
    const [active, setActive] = useState<ActionMetadata | null>(null)
    const dataEndpoint = endpoint ?? `/data/${model}/me`

    if (surfaced.length === 0) return null

    return (
        <>
            <div className={className ?? 'flex items-center gap-2'}>
                {surfaced.map((a) => {
                    const isCreate = (a.placement ?? 'row') === 'create'
                    return (
                        <Button
                            key={a.key}
                            variant={isCreate ? 'default' : 'outline'}
                            onClick={() => setActive(toActionMetadata(a))}
                            style={a.color && !isCreate ? { borderColor: a.color, color: a.color } : undefined}
                        >
                            <DynamicIcon name={a.icon || (isCreate ? 'Plus' : 'Zap')} className="mr-2 h-4 w-4" />
                            {a.label}
                        </Button>
                    )
                })}
            </div>

            {active && (
                <ActionModalDispatcher
                    open={!!active}
                    onOpenChange={(open) => {
                        if (!open) setActive(null)
                    }}
                    action={active}
                    model={model}
                    record={{}}
                    endpoint={dataEndpoint}
                    onSuccess={() => {
                        setActive(null)
                        onChange?.()
                    }}
                />
            )}
        </>
    )
}
