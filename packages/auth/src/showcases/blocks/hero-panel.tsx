// Title + subtitle stacked block. Use it as the top of any auth showcase
// (or any hero zone in the app — module dashboards, settings empty states,
// marketing surfaces). No brand or product assumptions.
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui/lib'

export interface HeroPanelProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Optional eyebrow rendered above the title (badge, pill, etc). */
  eyebrow?: ReactNode
  /** Optional content rendered below the subtitle (CTAs, badges). */
  footer?: ReactNode
  /** Default `'center'`. */
  align?: 'left' | 'center'
  /** Skip the entry animation. */
  noAnimate?: boolean
  className?: string
}

export function HeroPanel({
  title,
  subtitle,
  eyebrow,
  footer,
  align = 'center',
  noAnimate,
  className,
}: HeroPanelProps) {
  const Wrap = noAnimate ? 'div' : motion.div
  const animProps = noAnimate
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5 },
      }
  return (
    <Wrap
      {...(animProps as object)}
      className={cn(
        'max-w-md',
        align === 'center' ? 'text-center mx-auto' : 'text-left',
        className,
      )}
    >
      {eyebrow && <div className="mb-3">{eyebrow}</div>}
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      {subtitle && (
        <p className="text-muted-foreground text-sm leading-relaxed mt-3">{subtitle}</p>
      )}
      {footer && <div className="mt-6">{footer}</div>}
    </Wrap>
  )
}
