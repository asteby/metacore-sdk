import * as React from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Button } from '../primitives/button'

export interface QrCodeFrameProps extends Omit<React.ComponentProps<'figure'>, 'children'> {
  /** QR image (data URL or URL). Empty while the code is being generated. */
  src?: string | null
  /** Accessible description, e.g. «Código QR para vincular WhatsApp». */
  alt: string
  /** Rendered side of the code in CSS px (frame adds the quiet zone). Default 256. */
  size?: number
  /**
   * White margin around the code in CSS px. Scanners need ~4 modules; for a
   * typical 25–41 module code at 256 px that is 24–40 px. Default 24.
   */
  quietZone?: number
  /** The session is starting / a new code is on its way. */
  loading?: boolean
  /** The code expired: dims it and shows the refresh action. */
  expired?: boolean
  /** Asks for a new code (shown when `expired`, or always if `showRefresh`). */
  onRefresh?: () => void
  showRefresh?: boolean
  /** Caption under the code (instructions, countdown). */
  caption?: React.ReactNode
}

/**
 * Easy-to-scan QR frame: the code always sits on pure white with a real quiet
 * zone (dark mode and the glass theme never tint it), is upscaled with
 * `image-rendering: pixelated` so modules stay crisp, and keeps a fixed size so
 * the dialog does not jump when the code refreshes. Loading and expired states
 * are announced (`aria-live`) and never rely on color alone.
 *
 * i18n keys (optional): `qr_frame.loading`, `qr_frame.expired`, `qr_frame.refresh`.
 */
export function QrCodeFrame({
  src,
  alt,
  size = 256,
  quietZone = 24,
  loading = false,
  expired = false,
  onRefresh,
  showRefresh = false,
  caption,
  className,
  ...props
}: QrCodeFrameProps) {
  const { t } = useTranslation()
  const side = size + quietZone * 2
  const busy = loading || !src
  return (
    <figure
      data-slot='qr-code-frame'
      data-state={busy ? 'loading' : expired ? 'expired' : 'ready'}
      className={cn('flex flex-col items-center gap-3', className)}
      {...props}
    >
      <div
        className='relative rounded-2xl border shadow-sm'
        // Forced white surface + quiet zone: scanners need light margins on every theme.
        style={{ width: side, height: side, padding: quietZone, backgroundColor: '#fff', maxWidth: '100%' }}
      >
        {src && (
          <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            draggable={false}
            className={cn('block size-full select-none object-contain', (expired || loading) && 'opacity-15')}
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        <div aria-live='polite' className='absolute inset-0 flex flex-col items-center justify-center gap-2 text-center'>
          {busy && (
            <span className='flex flex-col items-center gap-2 text-sm text-neutral-700'>
              <Loader2 aria-hidden='true' className='size-6 animate-spin motion-reduce:animate-none' />
              {t('qr_frame.loading', { defaultValue: 'Generando código…' })}
            </span>
          )}
          {!busy && expired && (
            <span className='text-sm font-medium text-neutral-800'>
              {t('qr_frame.expired', { defaultValue: 'El código venció' })}
            </span>
          )}
        </div>
      </div>
      {onRefresh && (expired || showRefresh) && (
        <Button type='button' variant='outline' size='sm' onClick={onRefresh} disabled={loading}>
          <RefreshCw aria-hidden='true' className='size-3.5' />
          {t('qr_frame.refresh', { defaultValue: 'Generar otro código' })}
        </Button>
      )}
      {caption && <figcaption className='text-muted-foreground max-w-xs text-center text-sm'>{caption}</figcaption>}
    </figure>
  )
}
