// Slot — named extension points the host renders and addons contribute to at
// register() time. Keyed by a slot id (e.g. "dashboard.widgets",
// "invoice.footer"). Each contribution is an arbitrary React element factory.
//
// El store es `slotStore` de @asteby/metacore-sdk: el mismo donde escribe
// `api.registry.registerSlot` (AddonAPI) y `registerDocumentContribution`, así
// que hay una sola lista por slot. Una entrada con addon dueño (`owner`) que
// consta como NO instalado (InstalledAddonsProvider) no se pinta.
import React, { useSyncExternalStore } from 'react'
import { slotStore, type SlotComponent, type SlotEntry } from '@asteby/metacore-sdk'
import { useInstalledAddons } from './installed-addons-context'

export type { SlotComponent, SlotEntry }

/** Alias histórico del store canónico (`slotRegistry.register/get/subscribe`). */
export const slotRegistry = slotStore

export interface SlotProps {
    /** Slot id. */
    name: string
    /** Props forwarded to each contribution component. */
    props?: Record<string, any>
    /** Fallback element shown when no contribution is registered. */
    fallback?: React.ReactNode
}

export function Slot({ name, props, fallback = null }: SlotProps) {
    const all = useSyncExternalStore(
        (cb) => slotStore.subscribe(cb),
        () => slotStore.get(name),
        () => slotStore.get(name),
    )
    const installed = useInstalledAddons()
    const entries = installed ? all.filter((e) => !e.owner || installed.addons.has(e.owner)) : all
    if (entries.length === 0) return <>{fallback}</>
    return (
        <>
            {entries.map((entry, i) => {
                const C = entry.component
                return <C key={`${entry.source ?? 'anon'}-${i}`} {...(props ?? {})} />
            })}
        </>
    )
}
