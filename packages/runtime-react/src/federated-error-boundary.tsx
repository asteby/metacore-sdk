// FederatedErrorBoundary — isolates a federated remote (page, panel, widget,
// register() fiber children) from the host shell. A render error inside the
// remote paints a contained error card with "Reintentar"; the sidebar, header
// and every other addon keep working. The host reports the incident through
// `onError` (ops: reportFrontendIncident) — the boundary itself never logs to
// the network.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'

export interface FederatedErrorInfo {
    /** Addon key (or remote scope) that failed. */
    addonKey?: string
    /** Exposed module that failed (`./pages/control-tower`). */
    expose?: string
    componentStack?: string | null
}

export interface FederatedErrorFallbackProps {
    error: Error
    reset: () => void
    addonKey?: string
}

export interface FederatedErrorBoundaryProps {
    addonKey?: string
    expose?: string
    /** Report the failure (telemetry / incident). Called once per error. */
    onError?: (error: Error, info: FederatedErrorInfo) => void
    /** Custom fallback. Default: contained card with the message and a retry button. */
    fallback?: (props: FederatedErrorFallbackProps) => ReactNode
    /** Changing any of these clears the error (e.g. a new `?v=` remote URL). */
    resetKeys?: readonly unknown[]
    /** Called after the user (or a resetKeys change) clears the error. */
    onReset?: () => void
    /** Copy for the default fallback. */
    strings?: Partial<FederatedErrorStrings>
    children?: ReactNode
}

export interface FederatedErrorStrings {
    title: string
    description: string
    retry: string
}

const DEFAULT_STRINGS: FederatedErrorStrings = {
    title: 'Esta sección no se pudo mostrar',
    description: 'El resto de la aplicación sigue funcionando. Puedes reintentar.',
    retry: 'Reintentar',
}

interface State {
    error: Error | null
}

function changed(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
    return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
}

export class FederatedErrorBoundary extends Component<FederatedErrorBoundaryProps, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: unknown): State {
        return { error: error instanceof Error ? error : new Error(String(error)) }
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        const err = error instanceof Error ? error : new Error(String(error))
        try {
            this.props.onError?.(err, {
                addonKey: this.props.addonKey,
                expose: this.props.expose,
                componentStack: info.componentStack,
            })
        } catch {
            /* a failing reporter must not take the shell down */
        }
    }

    componentDidUpdate(prev: FederatedErrorBoundaryProps): void {
        if (this.state.error && changed(prev.resetKeys, this.props.resetKeys)) this.reset()
    }

    reset = (): void => {
        this.setState({ error: null })
        this.props.onReset?.()
    }

    render(): ReactNode {
        const { error } = this.state
        if (!error) return this.props.children
        if (this.props.fallback) {
            return this.props.fallback({ error, reset: this.reset, addonKey: this.props.addonKey })
        }
        const s = { ...DEFAULT_STRINGS, ...this.props.strings }
        return (
            <div
                role="alert"
                data-testid="federated-error"
                data-addon={this.props.addonKey}
                className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            >
                <AlertTriangle aria-hidden className="h-6 w-6 text-destructive" />
                <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                    {error.message ? (
                        <p className="max-w-md break-words font-mono text-[11px] text-muted-foreground/80">
                            {error.message}
                        </p>
                    ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={this.reset}>
                    <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                    {s.retry}
                </Button>
            </div>
        )
    }
}
