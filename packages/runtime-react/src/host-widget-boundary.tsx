// HostWidgetBoundary — aísla un widget registrado (de campo o de relación) dentro
// del formulario: si el componente del addon lanza al pintar o al aplicar cambios
// al DOM (p. ej. `NotFoundError: insertBefore/removeChild` cuando el traductor del
// navegador reemplazó nodos de texto), se ve un aviso compacto con «Reintentar»
// en el lugar del campo; el resto del formulario y la página siguen vivos. Sin
// esto el error subía hasta la ruta y el usuario veía la pantalla 500.
import type { ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { FederatedErrorBoundary } from './federated-error-boundary'
import { useBundledTranslation, type TranslationBundles } from './bundled-translation'

const BUNDLES: TranslationBundles = {
    es: {
        'runtime.widget_error.title': 'Este campo no se pudo mostrar',
        'runtime.widget_error.description': 'El resto del formulario sigue funcionando. Si tienes activo el traductor del navegador, desactívalo para esta página.',
        'runtime.widget_error.retry': 'Reintentar',
    },
    en: {
        'runtime.widget_error.title': 'This field could not be displayed',
        'runtime.widget_error.description': 'The rest of the form still works. If the browser translator is on, turn it off for this page.',
        'runtime.widget_error.retry': 'Retry',
    },
}

function WidgetErrorCard({ error, reset, name }: { error: Error; reset: () => void; name: string }) {
    const { t } = useBundledTranslation(BUNDLES)
    return (
        <div
            role="alert"
            data-testid="host-widget-error"
            data-widget={name}
            className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs"
        >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium text-foreground">
                    <span>{t('runtime.widget_error.title')}</span>
                </p>
                <p className="text-muted-foreground">
                    <span>{t('runtime.widget_error.description')}</span>
                </p>
                {error.message ? (
                    <p className="break-words font-mono text-[11px] text-muted-foreground/80" translate="no">
                        <span>{error.message}</span>
                    </p>
                ) : null}
            </div>
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={reset}>
                <RotateCcw aria-hidden className="mr-1 size-3.5" />
                <span>{t('runtime.widget_error.retry')}</span>
            </Button>
        </div>
    )
}

export interface HostWidgetBoundaryProps {
    /** Nombre del widget registrado (diagnóstico). */
    name: string
    /** Cambiar cualquiera de estos limpia el error (p. ej. el registro del widget). */
    resetKeys?: readonly unknown[]
    onError?: (error: Error) => void
    children?: ReactNode
}

export function HostWidgetBoundary({ name, resetKeys, onError, children }: HostWidgetBoundaryProps) {
    return (
        <FederatedErrorBoundary
            addonKey={`widget:${name}`}
            resetKeys={resetKeys}
            onError={(err) => {
                if (onError) onError(err)
                else if (typeof console !== 'undefined') console.error(`[widget ${name}]`, err)
            }}
            fallback={({ error, reset }) => <WidgetErrorCard error={error} reset={reset} name={name} />}
        >
            {children}
        </FederatedErrorBoundary>
    )
}
