// Per-model UI extension registry. Apps register once at boot and
// `<DynamicCRUDPage>` composes the registered extension automatically — no
// per-route forking, no copy-paste of the page shell.
//
//   import { registerModelExtension } from '@asteby/metacore-runtime-react'
//
//   registerModelExtension('customers', {
//       headerExtras: CustomersKpiStrip,
//       toolbarExtras: BulkAssignButton,
//       hideImport: true,
//   })
//
// The registry is a module-level singleton — intentional. A React context
// would force every consumer to wrap a provider just to read a static
// configuration that is set once at app boot.
import * as React from 'react'

export interface ModelExtensionProps {
    model: string
    onRefresh: () => void
}

export interface ModelExtension {
    headerExtras?: React.ComponentType<ModelExtensionProps>
    toolbarExtras?: React.ComponentType<ModelExtensionProps>
    hideCreate?: boolean
    hideExport?: boolean
    hideImport?: boolean
    hideRefresh?: boolean
    title?: string
    newLabel?: string
}

const registry = new Map<string, ModelExtension>()

export function registerModelExtension(model: string, ext: ModelExtension): void {
    registry.set(model, ext)
}

export function getModelExtension(model: string): ModelExtension | undefined {
    return registry.get(model)
}

export function clearModelExtensions(): void {
    registry.clear()
}
