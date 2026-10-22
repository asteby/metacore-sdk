import { memo, useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Paperclip, Star } from 'lucide-react'
import type { ConversationSummary, InboxTag } from './types'
import { useInboxLabels, type InboxLabels } from './i18n'
import { useVirtualList } from './use-virtual-list'
import { EmptyState, ErrorState, ListSkeleton } from './states'
import { cx, FOCUS, formatListTime, initials, toDate } from './utils'

const TAG_TONE: Record<NonNullable<InboxTag['tone']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive',
}

interface RowProps {
  item: ConversationSummary
  index: number
  setSize: number
  top: number
  height: number
  selected: boolean
  locale: string
  labels: InboxLabels
  domId: string
  onSelect: (id: string) => void
  renderAccessory?: (item: ConversationSummary) => ReactNode
}

const Row = memo(function Row({ item, index, setSize, top, height, selected, locale, labels, domId, onSelect, renderAccessory }: RowProps) {
  const unread = !!item.unread
  const count = typeof item.unread === 'number' && item.unread > 1 ? item.unread : null
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      data-conversation-id={item.id}
      onClick={() => onSelect(item.id)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height, transform: `translateY(${top}px)` }}
      className={cx(
        'group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 transition-colors duration-150 motion-reduce:transition-none',
        selected ? 'bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <span
        className={cx('flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground')}
        aria-hidden
      >
        {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : initials(item.participants)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cx('truncate text-sm', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>{item.participants}</span>
          <time className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={toDate(item.lastAt)?.toISOString()}>
            {formatListTime(item.lastAt, locale)}
          </time>
        </span>
        <span className={cx('block truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>{item.title || labels.noSubject}</span>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.preview}</span>
          {item.tags?.slice(0, 2).map((t) => (
            <span key={t.id} className={cx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', TAG_TONE[t.tone ?? 'neutral'])}>
              {t.label}
            </span>
          ))}
          {item.hasAttachments && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={labels.withAttachments} />}
          {item.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label={labels.starred} />}
          {renderAccessory?.(item)}
        </span>
      </span>
      {unread && (
        <span
          className="flex min-w-2.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
          role="img"
          aria-label={count ? `${count} ${labels.unread}` : labels.unread}
        >
          {count ?? <span className="size-2" />}
        </span>
      )}
    </div>
  )
})

export interface ConversationListProps {
  items: ConversationSummary[]
  selectedId?: string | null
  onSelect: (id: string) => void
  loading?: boolean
  loadingMore?: boolean
  error?: unknown
  onRetry?: () => void
  /** Called when the user scrolls within `endThreshold` rows of the end. */
  onEndReached?: () => void
  endThreshold?: number
  /** Fixed row height in px; fixed rows are what keep thousands of items fluid. */
  rowHeight?: number
  /** Extra per-row node (e.g. an assignee chip). Keep it cheap. */
  renderAccessory?: (item: ConversationSummary) => ReactNode
  emptyState?: ReactNode
  'aria-label'?: string
  labels?: Partial<InboxLabels>
  className?: string
}

/**
 * Virtualized, keyboard-navigable listbox. Only the visible window plus an
 * overscan is mounted; rows are memoized so selecting or receiving a new
 * item re-renders just the rows whose props changed.
 */
export function ConversationList({
  items,
  selectedId,
  onSelect,
  loading,
  loadingMore,
  error,
  onRetry,
  onEndReached,
  endThreshold = 8,
  rowHeight = 76,
  renderAccessory,
  emptyState,
  labels: o,
  className,
  ...rest
}: ConversationListProps) {
  const { labels, locale } = useInboxLabels(o)
  const scrollRef = useRef<HTMLDivElement>(null)
  const uid = useRef(`cl-${Math.random().toString(36).slice(2, 8)}`).current
  const { start, end, totalSize, scrollToIndex } = useVirtualList(scrollRef, { count: items.length, itemSize: rowHeight })

  const selectedIndex = selectedId ? items.findIndex((i) => i.id === selectedId) : -1

  const endFired = useRef(0)
  useEffect(() => {
    if (!onEndReached || loadingMore || loading) return
    if (items.length > 0 && end >= items.length - endThreshold && endFired.current !== items.length) {
      endFired.current = items.length
      onEndReached()
    }
  }, [end, items.length, onEndReached, endThreshold, loadingMore, loading])

  const move = useCallback(
    (to: number) => {
      const next = items[Math.max(0, Math.min(items.length - 1, to))]
      if (!next) return
      onSelect(next.id)
      scrollToIndex(Math.max(0, Math.min(items.length - 1, to)))
    },
    [items, onSelect, scrollToIndex],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(selectedIndex + 1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(selectedIndex < 0 ? 0 : selectedIndex - 1))
    else if (e.key === 'Home') (e.preventDefault(), move(0))
    else if (e.key === 'End') (e.preventDefault(), move(items.length - 1))
  }

  if (error && items.length === 0) return <ErrorState onRetry={onRetry} labels={o} className={className} />
  if (loading && items.length === 0) return <ListSkeleton rowHeight={rowHeight} />
  if (items.length === 0) return <>{emptyState ?? <EmptyState className={className} />}</>

  const rows = []
  for (let i = start; i < end; i++) {
    const item = items[i]
    if (!item) continue
    rows.push(
      <Row
        key={item.id}
        item={item}
        index={i}
        setSize={items.length}
        top={i * rowHeight}
        height={rowHeight}
        selected={item.id === selectedId}
        locale={locale}
        labels={labels}
        domId={`${uid}-${item.id}`}
        onSelect={onSelect}
        renderAccessory={renderAccessory}
      />,
    )
  }

  return (
    <div className={cx('flex h-full min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        role="listbox"
        tabIndex={0}
        aria-label={rest['aria-label'] ?? labels.conversations}
        aria-activedescendant={selectedId ? `${uid}-${selectedId}` : undefined}
        onKeyDown={onKeyDown}
        className={cx('relative min-h-0 flex-1 overflow-y-auto overscroll-contain [contain:strict]', FOCUS)}
      >
        <div style={{ height: totalSize, position: 'relative' }}>{rows}</div>
      </div>
      {loadingMore && (
        <p role="status" className="shrink-0 border-t border-border/40 py-2 text-center text-xs text-muted-foreground">
          {labels.loadingMore}
        </p>
      )}
    </div>
  )
}
