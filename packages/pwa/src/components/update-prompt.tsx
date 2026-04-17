import { RefreshCw, X } from 'lucide-react'
import { type ComponentType, type ReactNode } from 'react'
import { usePWAContext } from '../provider'

export interface UpdatePromptMessages {
  title?: string
  description?: string
  updateLabel?: string
  dismissLabel?: string
}

export interface UpdatePromptProps {
  ButtonComponent?: ComponentType<{
    onClick?: () => void
    children?: ReactNode
    variant?: 'default' | 'outline'
    size?: 'sm'
  }>
  messages?: UpdatePromptMessages
  className?: string
}

const DEFAULTS: Required<UpdatePromptMessages> = {
  title: 'Actualización disponible',
  description: 'Hay una nueva versión disponible',
  updateLabel: 'Actualizar',
  dismissLabel: 'Después',
}

function DefaultButton({
  onClick,
  children,
  variant = 'default',
  size,
}: {
  onClick?: () => void
  children?: ReactNode
  variant?: 'default' | 'outline'
  size?: 'sm'
}) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
  const sizeClass = size === 'sm' ? 'h-8 px-3' : 'h-9 px-4'
  const variantClass =
    variant === 'outline'
      ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
      : 'bg-primary text-primary-foreground hover:bg-primary/90'
  return (
    <button type="button" onClick={onClick} className={`${base} ${sizeClass} ${variantClass}`}>
      {children}
    </button>
  )
}

export function PWAUpdatePrompt({
  ButtonComponent = DefaultButton,
  messages,
  className,
}: UpdatePromptProps = {}) {
  const { needRefresh, updateApp, closeUpdatePrompt } = usePWAContext()
  const msgs = { ...DEFAULTS, ...messages }

  if (!needRefresh) return null

  return (
    <div
      className={
        className ??
        'fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border bg-background p-4 shadow-lg'
      }
    >
      <button
        type="button"
        onClick={closeUpdatePrompt}
        className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <RefreshCw className="h-5 w-5 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold">{msgs.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{msgs.description}</p>
          <div className="flex gap-2 mt-3">
            <ButtonComponent onClick={updateApp} size="sm">
              {msgs.updateLabel}
            </ButtonComponent>
            <ButtonComponent onClick={closeUpdatePrompt} variant="outline" size="sm">
              {msgs.dismissLabel}
            </ButtonComponent>
          </div>
        </div>
      </div>
    </div>
  )
}
