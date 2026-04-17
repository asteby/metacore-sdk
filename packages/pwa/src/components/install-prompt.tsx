import { Download, X } from 'lucide-react'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { usePWAContext } from '../provider'

export interface InstallPromptMessages {
  title?: string
  description?: string
  installLabel?: string
  dismissLabel?: string
}

export interface InstallPromptProps {
  /** Optional custom button to render — receives onClick, children, variant and size. */
  ButtonComponent?: ComponentType<{
    onClick?: () => void
    children?: ReactNode
    variant?: 'default' | 'outline'
    size?: 'sm'
  }>
  messages?: InstallPromptMessages
  className?: string
}

const DEFAULTS: Required<InstallPromptMessages> = {
  title: 'Instalar App',
  description: 'Instala la app para acceso rápido y funcionalidad offline',
  installLabel: 'Instalar',
  dismissLabel: 'Ahora no',
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

export function PWAInstallPrompt({
  ButtonComponent = DefaultButton,
  messages,
  className,
}: InstallPromptProps = {}) {
  const { isInstallable, installApp } = usePWAContext()
  const [show, setShow] = useState(false)
  const msgs = { ...DEFAULTS, ...messages }

  useEffect(() => {
    if (isInstallable) {
      setShow(true)
    }
  }, [isInstallable])

  const handleInstall = async () => {
    const installed = await installApp()
    if (installed) {
      setShow(false)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pwa-install-dismissed', 'true')
    }
  }

  if (!show || !isInstallable) return null

  return (
    <div
      className={
        className ??
        'fixed top-4 right-4 z-50 max-w-sm rounded-lg border bg-background p-4 shadow-lg'
      }
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Download className="h-5 w-5 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold">{msgs.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{msgs.description}</p>
          <div className="flex gap-2 mt-3">
            <ButtonComponent onClick={handleInstall} size="sm">
              {msgs.installLabel}
            </ButtonComponent>
            <ButtonComponent onClick={handleDismiss} variant="outline" size="sm">
              {msgs.dismissLabel}
            </ButtonComponent>
          </div>
        </div>
      </div>
    </div>
  )
}
