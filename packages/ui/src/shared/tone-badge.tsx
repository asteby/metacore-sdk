import * as React from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/primitives/badge'
import { Alert, AlertDescription, AlertTitle } from '@/primitives/alert'
import { toneClasses, type Tone } from './tone'

/** Los tonos de ESTADO llevan icono + etiqueta (nunca solo color); muted/brand son decorativos y no lo llevan. */
const STATUS_ICON: Partial<Record<Tone, typeof Info>> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
}

export type ToneBadgeProps = { tone?: Tone; icon?: boolean } & Omit<React.ComponentProps<typeof Badge>, 'variant' | 'color'>

/** Insignia/estado con tono (envuelve `Badge`): color semántico del tema + icono en los tonos de estado. */
export function ToneBadge({ tone = 'muted', icon = true, className, children, ...props }: ToneBadgeProps) {
  const Icon = icon ? STATUS_ICON[tone] : undefined
  return (
    <Badge variant='outline' className={cn('gap-1 rounded-full px-2 py-0.5 text-xs font-medium', toneClasses(tone, 'soft'), className)} {...props}>
      {Icon ? <Icon className='size-3 shrink-0' aria-hidden /> : null}
      {children}
    </Badge>
  )
}

export type ToneDotProps = { tone?: Tone; label?: string; className?: string }

/** Punto de estado. Decorativo por omisión; pasa `label` para anunciarlo a lectores de pantalla. */
export function ToneDot({ tone = 'muted', label, className }: ToneDotProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block size-2 shrink-0 rounded-full', toneClasses(tone, 'bar'), className)}
    />
  )
}

const ALERT_ICON: Record<Tone, typeof Info> = { muted: Info, brand: Info, info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle }

export type ToneAlertProps = { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; className?: string }

/** Aviso con tono (envuelve `Alert`). `danger`/`warning` se anuncian como alerta; el resto como estado. */
export function ToneAlert({ tone = 'info', title, children, className }: ToneAlertProps) {
  const Icon = ALERT_ICON[tone]
  return (
    <Alert role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn(toneClasses(tone, 'soft'), className)}>
      <Icon className='size-4' aria-hidden />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  )
}
