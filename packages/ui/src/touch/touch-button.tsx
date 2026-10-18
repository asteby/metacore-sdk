import * as React from 'react'
import { cn } from '@/lib/utils'
import { touchFontSizeCss, touchMinTargetCss } from './constants'

export type TouchButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'

export interface TouchButtonProps extends React.ComponentProps<'button'> {
  variant?: TouchButtonVariant
  /** Min hit target in px. Defaults to the theme's `--touch-min-target` (60). */
  minTarget?: number
  /** Stretch to the container width. */
  block?: boolean
}

const variants: Record<TouchButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border-2 border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
}

/** Brand-free large button for finger input. Never smaller than the min target. */
export const TouchButton = React.forwardRef<HTMLButtonElement, TouchButtonProps>(
  function TouchButton(
    { className, variant = 'default', minTarget, block, type = 'button', style, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-slot='touch-button'
        className={cn(
          'inline-flex select-none items-center justify-center gap-2 rounded-xl px-6 font-semibold touch-manipulation transition-transform active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-4 focus-visible:ring-ring/60 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
          variants[variant],
          block && 'w-full',
          className,
        )}
        style={{
          minHeight: touchMinTargetCss(minTarget),
          minWidth: touchMinTargetCss(minTarget),
          fontSize: touchFontSizeCss(),
          ...style,
        }}
        {...props}
      />
    )
  },
)
