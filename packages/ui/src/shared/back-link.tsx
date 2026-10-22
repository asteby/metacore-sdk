import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'

type BackLinkBase = {
  className?: string
  /** Visible text. Default «Atrás». Ignored with `asChild` (the child's text is used). */
  label?: React.ReactNode
}

export type BackLinkProps =
  | (BackLinkBase & { asChild: true; children: React.ReactElement })
  | (BackLinkBase & { asChild?: false } & Omit<React.ComponentProps<'a'>, 'children'> & { href: string })
  | (BackLinkBase & { asChild?: false } & Omit<React.ComponentProps<'button'>, 'children'> & { href?: undefined })

const classes =
  'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ms-2 inline-flex min-h-11 max-w-full min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-[3px] [&_svg]:size-4 [&_svg]:shrink-0'

/**
 * «‹ Atrás» link with a 44px target. Router-agnostic:
 * - `<BackLink href='/m/orders' />` renders an `<a>`.
 * - `<BackLink asChild><Link to='/m/orders'>Órdenes</Link></BackLink>` reuses the router link.
 * - `<BackLink onClick={() => history.back()} />` renders a `<button>`.
 */
export function BackLink(props: BackLinkProps) {
  const { t } = useTranslation()
  const fallback = t('back_link.label', { defaultValue: 'Atrás' })

  if (props.asChild) {
    const { className, children } = props
    return (
      <Slot data-slot='back-link' className={cn(classes, className)}>
        <ChevronLeft aria-hidden='true' />
        <Slottable>{children}</Slottable>
      </Slot>
    )
  }

  if (typeof props.href === 'string') {
    const { className, label, asChild: _asChild, ...rest } = props as BackLinkBase & React.ComponentProps<'a'> & { asChild?: false }
    return (
      <a data-slot='back-link' className={cn(classes, className)} {...rest}>
        <ChevronLeft aria-hidden='true' />
        <span className='truncate'>{label ?? fallback}</span>
      </a>
    )
  }

  const { className, label, asChild: _asChild, ...rest } = props as BackLinkBase & React.ComponentProps<'button'> & { asChild?: false }
  return (
    <button type='button' data-slot='back-link' className={cn(classes, className)} {...rest}>
      <ChevronLeft aria-hidden='true' />
      <span className='truncate'>{label ?? fallback}</span>
    </button>
  )
}
