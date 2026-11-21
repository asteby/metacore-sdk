// Envoltorios perezosos de los componentes de setup/salud que expone el índice principal.
// El módulo `./setup` (≈85 KB minificado) ya no viaja en el chunk compartido de federación del
// host: baja la primera vez que una pantalla monta uno de estos componentes. Import directo y
// helpers: subpath `@asteby/metacore-runtime-react/setup` (sin cambios).
import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react'
import type * as SetupModule from './setup'

type SetupExports = typeof SetupModule

function lazySetup<K extends keyof SetupExports>(name: K) {
    const Impl = lazy(() => import('./setup').then((m) => ({ default: m[name] as unknown as ComponentType<any> })))
    function LazySetupComponent(props: ComponentProps<SetupExports[K] & ComponentType<any>>) {
        return (
            <Suspense fallback={null}>
                <Impl {...props} />
            </Suspense>
        )
    }
    LazySetupComponent.displayName = `Lazy(${String(name)})`
    return LazySetupComponent as unknown as SetupExports[K]
}

export const SetupFlow = lazySetup('SetupFlow')
export const SetupFormStep = lazySetup('SetupFormStep')
export const RecordsTable = lazySetup('RecordsTable')
export const HealthCard = lazySetup('HealthCard')
export const StepStatusBadge = lazySetup('StepStatusBadge')
export const AddonConfigSurface = lazySetup('AddonConfigSurface')
export const ConnectorBlocks = lazySetup('ConnectorBlocks')
