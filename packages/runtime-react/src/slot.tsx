// Slot / SlotRegistry — named extension points the host renders and addons
// contribute to at register() time. Keyed by a slot id (e.g. "dashboard.widgets",
// "invoice.footer"). Each contribution is an arbitrary React element factory.
import React, { useSyncExternalStore } from 'react'

export type SlotComponent<P = any> = React.ComponentType<P>

interface SlotEntry {
    id: string
    component: SlotComponent
    priority: number
    source?: string
}

type Listener = () => void

class SlotRegistryImpl {
    private slots = new Map<string, SlotEntry[]>()
    private listeners = new Set<Listener>()

    register(slotId: string, component: SlotComponent, opts?: { priority?: number; source?: string }): () => void {
        const entry: SlotEntry = { id: slotId, component, priority: opts?.priority ?? 0, source: opts?.source }
        const list = this.slots.get(slotId) ?? []
        list.push(entry)
        list.sort((a, b) => b.priority - a.priority)
        this.slots.set(slotId, list)
        this.emit()
        return () => {
            const arr = this.slots.get(slotId)
            if (!arr) return
            const idx = arr.indexOf(entry)
            if (idx >= 0) {
                arr.splice(idx, 1)
                this.emit()
            }
        }
    }

    get(slotId: string): SlotEntry[] {
        return this.slots.get(slotId) ?? []
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    private emit() { this.listeners.forEach(l => l()) }
}

export const slotRegistry = new SlotRegistryImpl()

export interface SlotProps {
    /** Slot id. */
    name: string
    /** Props forwarded to each contribution component. */
    props?: Record<string, any>
    /** Fallback element shown when no contribution is registered. */
    fallback?: React.ReactNode
}

export function Slot({ name, props, fallback = null }: SlotProps) {
    const entries = useSyncExternalStore(
        (cb) => slotRegistry.subscribe(cb),
        () => slotRegistry.get(name),
        () => slotRegistry.get(name),
    )
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
