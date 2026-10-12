import type { ReactNode } from 'react'
import { AGENT_BAR } from './surfaces'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

/** Translucent top bar shared by every chat surface: start slot, avatar, title, end slot. */
export function ChatHeader({
  start,
  avatar,
  title,
  subtitle,
  badge,
  children,
  className,
}: {
  start?: ReactNode
  avatar?: ReactNode
  title: string
  subtitle?: string
  badge?: ReactNode
  /** Right-side controls. */
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cx('flex shrink-0 items-center gap-2 px-3 py-2', AGENT_BAR, className)}>
      {start}
      {avatar}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
      {badge}
      {children}
    </header>
  )
}
