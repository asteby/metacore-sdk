// Booleanos opcionales: control de tres estados (diferido) y marca de NULL.
// El control vive en tri-state-boolean-impl.tsx y se carga con React.lazy: sólo
// lo baja quien abre un formulario con un booleano opcional, así no suma al
// shell inicial de la app.
import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import type { TriStateBooleanFieldProps } from './tri-state-boolean-impl'

export type { TriStateBooleanFieldProps } from './tri-state-boolean-impl'

const Impl = lazy(() =>
    import('./tri-state-boolean-impl').then((m) => ({ default: m.TriStateBooleanField })),
)

/**
 * Control Sí / No / Sin definir para un booleano opcional. «Sin definir»
 * envía `null`. Accesible (radiogroup con flechas) y con i18n es/en.
 */
export function TriStateBooleanField(props: TriStateBooleanFieldProps) {
    return (
        <Suspense fallback={<span className="inline-block h-8" aria-busy="true" />}>
            <Impl {...props} />
        </Suspense>
    )
}

/**
 * Celda/vista de solo lectura para un booleano NULL: «—» (misma convención que
 * `formatDisplayValue`), con «Sin definir» como nombre accesible y tooltip.
 */
export function NullBooleanMark({ className }: { className?: string }) {
    const { t } = useTranslation()
    const label = t('common.unset', { defaultValue: 'Sin definir' })
    return (
        <span className={className ?? 'text-muted-foreground'} title={label} aria-label={label} data-bool-null="">
            —
        </span>
    )
}
