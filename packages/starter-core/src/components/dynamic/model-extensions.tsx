import React from 'react'

/**
 * Model Extension Registry
 *
 * Inject custom UI into dynamic model views without breaking the
 * dynamic architecture. Any model can register a header, toolbar,
 * or footer component that auto-renders in /m/$model pages.
 *
 * Registry pattern: apps register extensions at boot via
 * `registerModelExtension(key, component)` to avoid hardcoding
 * feature imports inside starter-core.
 */

export interface ModelExtension {
  /** Rendered above the table (e.g. SessionBar for cashier queue) */
  header?: React.ComponentType
  /** Rendered in the toolbar next to export/import */
  toolbarActions?: React.ComponentType
  /** Rendered below the table */
  footer?: React.ComponentType
  /** Hide the default "Crear" button */
  hideCreate?: boolean
}

const registry: Record<string, ModelExtension> = {}
const subscribers = new Set<() => void>()

function notify() {
  subscribers.forEach((fn) => fn())
}

/**
 * Register a model extension. Call from app bootstrap before the
 * first dynamic page renders. Passing `null` clears the entry.
 */
export function registerModelExtension(
  key: string,
  extension: ModelExtension | null
): void {
  if (extension === null) {
    delete registry[key]
  } else {
    registry[key] = extension
  }
  notify()
}

export function getModelExtension(model: string): ModelExtension | null {
  return registry[model] ?? null
}

/** Snapshot of all registered extensions reactive via useSyncExternalStore. */
export function useModelExtensions(): Record<string, ModelExtension> {
  return React.useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    () => registry,
    () => registry
  )
}
