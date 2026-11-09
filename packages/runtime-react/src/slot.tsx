// Slot — named extension points the host renders and addons contribute to at
// register() time. Keyed by a slot id (e.g. "dashboard.widgets",
// "invoice.footer"). Each contribution is an arbitrary React element factory.
//
// El store es `slotStore` de @asteby/metacore-sdk: el mismo donde escribe
// `api.registry.registerSlot` (AddonAPI) y `registerDocumentContribution`, así
// que hay una sola lista por slot. Una entrada con addon dueño (`owner`) que
// consta como NO instalado (InstalledAddonsProvider) no se pinta.
import React from 'react'
import { slotStore, type SlotComponent, type SlotEntry } from '@asteby/metacore-sdk'
import { AddonSlot } from './slots/addon-slot'

export type { SlotComponent, SlotEntry }

/**
 * @deprecated Alias histórico del store canónico (`slotRegistry.register/get/subscribe`);
 * prefiere `slotStore` de `@asteby/metacore-sdk` y monta con `<AddonSlot>`.
 */
export const slotRegistry = slotStore

export interface SlotProps {
    /** Slot id. */
    name: string
    /** Props forwarded to each contribution component. */
    props?: Record<string, any>
    /** Fallback element shown when no contribution is registered. */
    fallback?: React.ReactNode
}

/**
 * @deprecated Usa `<AddonSlot kind context>` (monta además las contribuciones
 * de manifest, con aislamiento y timeout). `<Slot>` delega en él y se mantiene
 * un major: los componentes siguen recibiendo `props` esparcidos.
 */
export function Slot({ name, props, fallback = null }: SlotProps) {
    return <AddonSlot kind={name} context={props} empty={fallback} />
}
