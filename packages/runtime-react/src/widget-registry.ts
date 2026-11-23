// Registro observable de componentes por nombre. Un solo mecanismo para los
// widgets que el kernel nombra en la metadata (`FieldDef.widget`,
// `RelationMeta.widget`): módulo singleton, `register` devuelve un disposer, y
// quien registra tarde (un addon federado) vuelve a pintar a los que esperaban.
import * as React from 'react'

export interface WidgetRegistry<C> {
    /**
     * Registra el componente de `name`. Devuelve un disposer; un registro posterior
     * con el mismo nombre reemplaza al anterior y el disposer viejo ya no lo toca.
     */
    register(name: string, component: C): () => void
    /** El componente de `name`, o undefined (nunca lanza). */
    get(name?: string | null): C | undefined
    /** Nombres registrados, para diagnóstico. */
    list(): string[]
    clear(): void
    /** Re-pinta al llamador cada vez que se (des)registra un componente. */
    useVersion(): number
}

export function createWidgetRegistry<C>(): WidgetRegistry<C> {
    const items = new Map<string, C>()
    const listeners = new Set<() => void>()
    let version = 0
    const emit = (): void => {
        version++
        listeners.forEach((l) => l())
    }
    const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }
    return {
        register(name, component) {
            items.set(name, component)
            emit()
            return () => {
                if (items.get(name) === component) {
                    items.delete(name)
                    emit()
                }
            }
        },
        get: (name) => (name ? items.get(name) : undefined),
        list: () => [...items.keys()],
        clear() {
            if (items.size === 0) return
            items.clear()
            emit()
        },
        useVersion: () => React.useSyncExternalStore(subscribe, () => version, () => version),
    }
}
