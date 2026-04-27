// Grid of icon + label tiles. Generic enough to back: marketplace addon
// previews, ERP module pickers, settings dashboards, "what's included" auth
// showcases, integration galleries. Apps pass `tiles` and choose layout.
import { motion } from 'framer-motion'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui/lib'

export interface Tile {
  /** Stable key. */
  key: string
  /** Primary text under the icon. */
  label: ReactNode
  /** Optional secondary text (category, tag, count). */
  tag?: ReactNode
  /** Lucide-style icon component (or anything that renders SVG). Optional. */
  Icon?: ComponentType<{ className?: string }>
  /** Image source — used instead of `Icon` if provided. */
  imageSrc?: string
  /** Click handler. Tile becomes a button when set. */
  onClick?: () => void
}

export interface TileGridProps {
  tiles: Tile[]
  /** Columns at lg+ (default 3). Mobile is always 2. */
  columns?: 2 | 3 | 4
  /** Skip the staggered entry animation. */
  noAnimate?: boolean
  /** Time between tile entries when animating, ms. Default 50. */
  stagger?: number
  className?: string
  /** Per-tile className (use to tweak padding/border without subclassing). */
  tileClassName?: string
}

export function TileGrid({
  tiles,
  columns = 3,
  noAnimate,
  stagger = 50,
  className,
  tileClassName,
}: TileGridProps) {
  const colsClass =
    columns === 2 ? 'lg:grid-cols-2' : columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
  return (
    <div className={cn('grid grid-cols-2 gap-3', colsClass, className)}>
      {tiles.map((tile, i) => {
        const content = (
          <div className="flex flex-col items-center text-center gap-2">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors overflow-hidden">
              {tile.imageSrc ? (
                <img src={tile.imageSrc} alt="" className="size-full object-cover" />
              ) : tile.Icon ? (
                <tile.Icon className="size-5 text-primary" />
              ) : null}
            </div>
            <div>
              <div className="text-xs font-semibold leading-tight">{tile.label}</div>
              {tile.tag && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{tile.tag}</div>
              )}
            </div>
          </div>
        )

        const innerProps = {
          className: cn(
            'group relative rounded-xl border bg-card p-3 shadow-sm',
            'hover:shadow-md hover:border-primary/30 transition-all',
            tile.onClick && 'cursor-pointer',
            tileClassName,
          ),
        }

        const animProps = noAnimate
          ? {}
          : {
              initial: { opacity: 0, scale: 0.92 },
              animate: { opacity: 1, scale: 1 },
              transition: { delay: 0.1 + i * (stagger / 1000), duration: 0.35 },
            }

        if (tile.onClick) {
          return (
            <motion.button
              key={tile.key}
              type="button"
              onClick={tile.onClick}
              {...(animProps as object)}
              {...innerProps}
            >
              {content}
            </motion.button>
          )
        }
        return (
          <motion.div key={tile.key} {...(animProps as object)} {...innerProps}>
            {content}
          </motion.div>
        )
      })}
    </div>
  )
}
