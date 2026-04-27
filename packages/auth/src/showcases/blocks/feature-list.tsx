// Vertical list of icon + title + description rows. Generic explainer block
// — auth showcases ("what you get"), settings dashboards, onboarding tours,
// pricing-tier breakdowns. No product assumptions.
import { motion } from 'framer-motion'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui/lib'

export interface Feature {
  key: string
  Icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
}

export interface FeatureListProps {
  features: Feature[]
  noAnimate?: boolean
  /** Stagger between rows, ms. Default 70. */
  stagger?: number
  className?: string
}

export function FeatureList({
  features,
  noAnimate,
  stagger = 70,
  className,
}: FeatureListProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {features.map((feature, i) => {
        const animProps = noAnimate
          ? {}
          : {
              initial: { opacity: 0, x: -8 },
              animate: { opacity: 1, x: 0 },
              transition: { delay: 0.1 + i * (stagger / 1000), duration: 0.35 },
            }
        return (
          <motion.div
            key={feature.key}
            {...(animProps as object)}
            className="flex items-start gap-3"
          >
            {feature.Icon && (
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <feature.Icon className="size-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{feature.title}</div>
              {feature.description && (
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {feature.description}
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
