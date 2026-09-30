// Retroalimentación que no estorba (benchmark §6.4/§6.5, PIT-005):
//   - notify.success: toast breve «sustantivo + verbo», arriba y con duración corta.
//   - <SystemNoticeBanner>: avisos del sistema («Hay novedades») en banner no
//     bloqueante, nunca encima de las acciones primarias.
//   - <FormErrorBanner>: error accionable persistente (qué pasó + cómo corregirlo).
//   - <EmptyState>: estado vacío con explicación y una acción primaria.
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Info, X, type LucideIcon } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'

/**
 * Props recomendadas para `<Toaster>` de metacore-ui: los toasts viven arriba a
 * la derecha (el área de acciones primarias suele estar abajo) y dejan hueco
 * bajo la cabecera. Se propagan tal cual: `<Toaster {...ACTION_SAFE_TOASTER_PROPS} />`.
 */
export const ACTION_SAFE_TOASTER_PROPS = {
    position: 'top-right' as const,
    offset: 72,
    mobileOffset: 72,
    visibleToasts: 3,
}

/** Duración de un toast de éxito (ms): confirma y se va. */
export const SUCCESS_TOAST_MS = 3000

export const notify = {
    /** Confirmación breve de un éxito («Pago registrado»). Admite «Deshacer». */
    success(message: string, opts?: { undo?: { label?: string; onUndo: () => void }; description?: string }) {
        return toast.success(message, {
            duration: SUCCESS_TOAST_MS,
            description: opts?.description,
            action: opts?.undo
                ? { label: opts.undo.label ?? 'Deshacer', onClick: opts.undo.onUndo }
                : undefined,
        })
    },
    /**
     * Error inesperado (red, 5xx) sin campo al que atribuirlo. Los errores de
     * validación NO van aquí: usa `mapApiError` + `<FormErrorBanner>`/error del input.
     */
    error(message: string, description?: string) {
        return toast.error(message, { description, duration: 8000 })
    },
}

export interface SystemNoticeBannerProps {
    message: ReactNode
    /** Acción opcional («Actualizar»). */
    action?: { label: string; onClick: () => void }
    onDismiss?: () => void
    dismissLabel?: string
    className?: string
}

/** Aviso del sistema en flujo normal de la página (no flota sobre botones). */
export function SystemNoticeBanner({ message, action, onDismiss, dismissLabel = 'Descartar', className }: SystemNoticeBannerProps) {
    return (
        <div
            role="status"
            data-slot="system-notice"
            className={`flex items-center gap-3 rounded-md border bg-muted px-3 py-2 text-sm ${className ?? ''}`}
        >
            <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">{message}</span>
            {action && (
                <Button type="button" size="sm" variant="outline" onClick={action.onClick}>
                    {action.label}
                </Button>
            )}
            {onDismiss && (
                <Button type="button" size="icon" variant="ghost" onClick={onDismiss} aria-label={dismissLabel}>
                    <X className="size-4" />
                </Button>
            )}
        </div>
    )
}

export interface FormErrorBannerProps {
    /** Qué pasó y cómo corregirlo (típicamente `mapApiError(...).form`). */
    message?: string
    /** Botón a la solución («Ir al campo», «Reintentar»). */
    action?: { label: string; onClick: () => void }
    className?: string
}

/** Error persistente de formulario; no renderiza nada sin `message`. */
export function FormErrorBanner({ message, action, className }: FormErrorBannerProps) {
    if (!message) return null
    return (
        <div
            role="alert"
            data-slot="form-error"
            className={`flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive ${className ?? ''}`}
        >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="flex-1">{message}</span>
            {action && (
                <Button type="button" size="sm" variant="outline" onClick={action.onClick}>
                    {action.label}
                </Button>
            )}
        </div>
    )
}

export interface EmptyStateProps {
    icon?: LucideIcon
    /** Qué falta («Aún no hay movimientos para este producto»). */
    title: string
    description?: string
    /** Acción primaria («Registrar saldo inicial»). Se oculta si `hidden`. */
    action?: { label: string; onClick?: () => void; href?: string; hidden?: boolean }
    className?: string
}

/** Estado vacío accionable: explicación + una acción primaria. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    const showAction = action && !action.hidden
    return (
        <div
            data-slot="empty-state"
            className={`flex flex-col items-center gap-2 px-4 py-10 text-center ${className ?? ''}`}
        >
            {Icon && <Icon className="size-8 text-muted-foreground" aria-hidden />}
            <p className="text-sm font-medium">{title}</p>
            {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
            {showAction &&
                (action.href ? (
                    <Button asChild size="sm" className="mt-2">
                        <a href={action.href}>{action.label}</a>
                    </Button>
                ) : (
                    <Button type="button" size="sm" className="mt-2" onClick={action.onClick}>
                        {action.label}
                    </Button>
                ))}
        </div>
    )
}
