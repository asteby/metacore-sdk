// Horizontal row of headline metrics. "1.2M+ messages", "+2k orgs",
// "99.9% uptime" — anywhere a quick credibility band makes sense (auth
// showcase footer, dashboard summary, marketing strip).
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui/lib'

export interface Stat {
  key: string
  /** The big number (or any node). */
  value: ReactNode
  /** The label under the number. */
  label: ReactNode
}

export interface StatRowProps {
  stats: Stat[]
  noAnimate?: boolean
  className?: string
}

export function StatRow({ stats, noAnimate, className }: StatRowProps) {
  return (
    <div className={cn('flex items-center justify-center gap-8 flex-wrap', className)}>
      {stats.map((stat, i) => {
        const animProps = noAnimate
          ? {}
          : {
              initial: { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              transition: { delay: 0.1 + i * 0.06, duration: 0.35 },
            }
        return (
          <motion.div
            key={stat.key}
            {...(animProps as object)}
            className="text-center"
          >
            <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </motion.div>
        )
      })}
    </div>
  )
}
