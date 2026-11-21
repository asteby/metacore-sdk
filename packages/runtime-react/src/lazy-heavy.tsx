// Componentes pesados que el índice principal expone como envoltorios perezosos (mismo nombre y
// props). En un host federado el índice viaja entero en el chunk compartido del shell; estos
// módulos solo se usan al abrir un diálogo o una pantalla concreta, así que bajan entonces.
// Medido en el índice (minificado): InspectionChecklist ~10 KB, ImportDialog ~7, ExportDialog ~6.
// DocumentEditor/DocumentLinesGrid NO: DocumentFormDialog debe pintar el editor en el primer frame.
import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react'
import type * as InspectionChecklistModule from './business/inspection-checklist'
import type * as ImportModule from './dialogs/import'
import type * as ExportModule from './dialogs/export'

function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K, label: string): M[K] {
    const Impl = lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType<any> })))
    function LazyComponent(props: ComponentProps<M[K] & ComponentType<any>>) {
        return (
            <Suspense fallback={null}>
                <Impl {...props} />
            </Suspense>
        )
    }
    LazyComponent.displayName = `Lazy(${label})`
    return LazyComponent as unknown as M[K]
}

export const InspectionChecklist = lazyNamed<typeof InspectionChecklistModule, 'InspectionChecklist'>(
    () => import('./business/inspection-checklist'),
    'InspectionChecklist',
    'InspectionChecklist',
)
export const ImportDialog = lazyNamed<typeof ImportModule, 'ImportDialog'>(() => import('./dialogs/import'), 'ImportDialog', 'ImportDialog')
export const ExportDialog = lazyNamed<typeof ExportModule, 'ExportDialog'>(() => import('./dialogs/export'), 'ExportDialog', 'ExportDialog')
