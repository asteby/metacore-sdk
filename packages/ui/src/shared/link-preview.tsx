import * as React from 'react'
import { ExternalLink, MessageSquareText, PlayCircle } from 'lucide-react'
import { cn } from '../lib/utils'

/*
 * Link previews (WhatsApp/Slack-style cards) built from metadata the BACKEND
 * already extracted (og:title, og:image, site name, favicon...). These
 * components never fetch external sites: the only network request is the
 * `<img>` for the URL they are given, ideally routed through the app's own
 * image proxy via `resolveImageUrl`.
 */

export type LinkPreviewKind = 'article' | 'post' | 'video' | 'other'

export interface LinkPreviewData {
  url: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  siteName?: string | null
  /** Derived from `url` when missing. */
  domain?: string | null
  faviconUrl?: string | null
  kind?: LinkPreviewKind | null
  author?: string | null
  publishedAt?: string | Date | null
  lang?: string | null
}

export type LinkPreviewVariant = 'compact' | 'row' | 'rich' | 'hero'

export interface LinkPreviewCardProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect' | 'title'> {
  data: LinkPreviewData
  /** Default `rich`. */
  variant?: LinkPreviewVariant
  badges?: React.ReactNode
  /** Extra line under the title (municipality, topic...). */
  meta?: React.ReactNode
  footer?: React.ReactNode
  /** Default `data.url`; `null` renders no link. */
  href?: string | null
  /** When set, the card is an accessible button and the external link becomes a secondary action. */
  onSelect?: () => void
  /** Default true → `target=_blank rel="noopener noreferrer nofollow"`. */
  external?: boolean
  /** Maps image/favicon URLs, e.g. to the backend image proxy. */
  resolveImageUrl?: (url: string) => string
  /** Default `es`. */
  locale?: string
  /** Reference time for the relative date (tests, SSR). */
  now?: Date
  /** Renders a skeleton with the same footprint. */
  loading?: boolean
}

/** Hostname without `www.`; best effort for malformed URLs. */
export function domainFromUrl(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return url
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .split(/[/?#]/)[0]
      .replace(/^www\./i, '')
      .toLowerCase()
  }
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` (no time) is a calendar day: parsed at LOCAL midnight, not UTC. */
function isDateOnly(date: string | Date): date is string {
  return typeof date === 'string' && DATE_ONLY.test(date.trim())
}

function toDate(date: string | Date): Date | null {
  if (isDateOnly(date)) {
    const [, y, m, d] = DATE_ONLY.exec(date.trim())!
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const d = date instanceof Date ? date : new Date(date)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** «hace 3 horas», «ayer», «hace 2 semanas»... via `Intl.RelativeTimeFormat`. */
export function formatRelativeTime(
  date: string | Date,
  opts: { now?: Date; locale?: string } = {}
): string {
  const d = toDate(date)
  if (!d) return ''
  const now = opts.now ?? new Date()
  // A date without time has day precision: «hoy», «ayer», «hace 3 días»… never hours.
  if (isDateOnly(date)) {
    const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000)
    const rtfDay = new Intl.RelativeTimeFormat(opts.locale ?? 'es', { numeric: 'auto' })
    const absDays = Math.abs(days)
    if (absDays < 7) return rtfDay.format(days, 'day')
    if (absDays < 30) return rtfDay.format(Math.round(days / 7), 'week')
    if (absDays < 365) return rtfDay.format(Math.round(days / 30), 'month')
    return rtfDay.format(Math.round(days / 365), 'year')
  }
  const diff = (d.getTime() - now.getTime()) / 1000
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(opts.locale ?? 'es', { numeric: 'auto' })
  if (abs < 45) return rtf.format(0, 'second')
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit)
  }
  return rtf.format(0, 'second')
}

function isSpanish(locale: string) {
  return locale.toLowerCase().startsWith('es')
}

const KIND_LABEL: Record<'es' | 'en', Record<LinkPreviewKind, string>> = {
  es: { article: 'Artículo', post: 'Publicación', video: 'Video', other: 'Enlace' },
  en: { article: 'Article', post: 'Post', video: 'Video', other: 'Link' },
}

function initialOf(text: string | null | undefined) {
  const ch = (text ?? '').trim().match(/[\p{L}\p{N}]/u)?.[0]
  return ch ? ch.toUpperCase() : '?'
}

/* ------------------------------------------------------------------ */
/* FaviconAvatar                                                        */
/* ------------------------------------------------------------------ */

export interface FaviconAvatarProps {
  domain?: string | null
  faviconUrl?: string | null
  /** Used for the initial when there is no favicon (falls back to the domain). */
  name?: string | null
  /** Default `sm`. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  resolveImageUrl?: (u: string) => string
  className?: string
}

const AVATAR_SIZE = {
  xs: 'size-4 text-[9px]',
  sm: 'size-5 text-[10px]',
  md: 'size-7 text-xs',
  lg: 'size-10 text-sm',
} as const

/** Site favicon in a fixed box; shows the site's initial when missing or broken. Decorative. */
export function FaviconAvatar({
  domain,
  faviconUrl,
  name,
  size = 'sm',
  resolveImageUrl,
  className,
}: FaviconAvatarProps) {
  // Remember WHICH url failed: a new url retries without an effect.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null)
  const failed = !!faviconUrl && failedUrl === faviconUrl
  const src = faviconUrl && !failed ? (resolveImageUrl ? resolveImageUrl(faviconUrl) : faviconUrl) : null
  return (
    <span
      aria-hidden='true'
      data-slot='favicon-avatar'
      className={cn(
        'bg-muted text-muted-foreground ring-border inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[25%] font-semibold ring-1 select-none',
        AVATAR_SIZE[size],
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt=''
          loading='lazy'
          decoding='async'
          referrerPolicy='no-referrer'
          className='size-full object-contain'
          onError={() => setFailedUrl(faviconUrl ?? null)}
        />
      ) : (
        initialOf(name || domain)
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* SourceBadge                                                          */
/* ------------------------------------------------------------------ */

export interface SourceBadgeProps {
  domain?: string | null
  siteName?: string | null
  faviconUrl?: string | null
  resolveImageUrl?: (u: string) => string
  /** Rendered after the name (e.g. «· hace 2 h», a tier). */
  suffix?: React.ReactNode
  className?: string
}

/** Favicon + site name (or domain): who published it. */
export function SourceBadge({
  domain,
  siteName,
  faviconUrl,
  resolveImageUrl,
  suffix,
  className,
}: SourceBadgeProps) {
  const label = siteName?.trim() || domain || ''
  return (
    <span
      data-slot='source-badge'
      className={cn('text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-xs', className)}
    >
      <FaviconAvatar
        size='xs'
        domain={domain}
        name={label}
        faviconUrl={faviconUrl}
        resolveImageUrl={resolveImageUrl}
      />
      <span className='text-foreground/80 truncate font-medium' title={domain && domain !== label ? domain : undefined}>
        {label}
      </span>
      {suffix}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* MediaGrid                                                            */
/* ------------------------------------------------------------------ */

export interface MediaGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Default `grid`. */
  layout?: 'grid' | 'list'
  /** Minimum card width in px for the auto-fill grid. Default 280. */
  minItemWidth?: number
  /** Default `md`. */
  gap?: 'sm' | 'md' | 'lg'
}

const GAP = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' } as const

/** Responsive feed: auto-fill grid (one column on phones) or a vertical list. */
export function MediaGrid({
  layout = 'grid',
  minItemWidth = 280,
  gap = 'md',
  className,
  style,
  ...props
}: MediaGridProps) {
  return (
    <div
      data-slot='media-grid'
      data-layout={layout}
      className={cn(layout === 'grid' ? 'grid items-stretch' : 'flex flex-col', GAP[gap], className)}
      style={
        layout === 'grid'
          ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minItemWidth}px), 1fr))`, ...style }
          : style
      }
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ */
/* LinkPreviewCard                                                      */
/* ------------------------------------------------------------------ */

const MEDIA_BOX: Record<LinkPreviewVariant, string> = {
  compact: 'aspect-square w-10 rounded-md',
  row: 'aspect-square w-20 rounded-lg sm:w-28',
  rich: 'aspect-video w-full',
  hero: 'aspect-video w-full',
}

interface PreviewMediaProps {
  variant: LinkPreviewVariant
  imageUrl?: string | null
  domain: string
  siteName?: string | null
  faviconUrl?: string | null
  kind?: LinkPreviewKind | null
  kindLabel?: string
  resolveImageUrl?: (u: string) => string
}

function PreviewMedia({
  variant,
  imageUrl,
  domain,
  siteName,
  faviconUrl,
  kind,
  kindLabel,
  resolveImageUrl,
}: PreviewMediaProps) {
  // Status is keyed by url: a new url starts as `loading` without an effect.
  const [state, setState] = React.useState<{ url: string | null | undefined; status: 'loading' | 'loaded' | 'error' }>(
    { url: imageUrl, status: 'loading' }
  )
  const status = state.url === imageUrl ? state.status : 'loading'
  const setStatus = (next: 'loaded' | 'error') => setState({ url: imageUrl, status: next })
  // Cached images may finish before React attaches onLoad.
  const imgRef = React.useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth > 0)
        setState((prev) => (prev.url === imageUrl && prev.status === 'loaded' ? prev : { url: imageUrl, status: 'loaded' }))
    },
    [imageUrl]
  )

  const src = imageUrl ? (resolveImageUrl ? resolveImageUrl(imageUrl) : imageUrl) : null
  const showImage = !!src && status !== 'error'
  const small = variant === 'compact' || variant === 'row'
  const label = siteName?.trim() || domain

  return (
    <div
      data-slot='link-preview-media'
      data-status={showImage ? status : 'fallback'}
      className={cn('bg-muted relative shrink-0 overflow-hidden', MEDIA_BOX[variant])}
    >
      {showImage ? (
        <>
          {status === 'loading' && (
            <div aria-hidden='true' className='bg-accent absolute inset-0 animate-pulse motion-reduce:animate-none' />
          )}
          <img
            ref={imgRef}
            src={src}
            alt=''
            loading='lazy'
            decoding='async'
            referrerPolicy='no-referrer'
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={cn(
              'absolute inset-0 size-full object-cover transition-[opacity,filter] duration-300 motion-reduce:transition-none',
              status === 'loaded' ? 'opacity-100' : 'opacity-0 blur-sm'
            )}
          />
        </>
      ) : (
        <div
          aria-hidden='true'
          data-slot='link-preview-fallback'
          className='bg-muted text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden'
        >
          {/* Large watermark initial keeps imageless cards from looking empty. */}
          <span className='text-foreground/[0.06] pointer-events-none absolute -right-2 -bottom-6 text-[7rem] leading-none font-black select-none'>
            {!small && initialOf(label)}
          </span>
          <FaviconAvatar
            size={small ? (variant === 'compact' ? 'sm' : 'md') : 'lg'}
            domain={domain}
            name={label}
            faviconUrl={faviconUrl}
            resolveImageUrl={resolveImageUrl}
          />
          {!small && <span className='relative max-w-[80%] truncate text-xs font-medium'>{domain}</span>}
        </div>
      )}
      {!small && (kind === 'video' || kind === 'post') && (
        <span className='bg-background/85 text-foreground absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur-sm'>
          {kind === 'video' ? <PlayCircle className='size-3.5' aria-hidden='true' /> : <MessageSquareText className='size-3.5' aria-hidden='true' />}
          {kindLabel}
        </span>
      )}
    </div>
  )
}

function CardSkeleton({ variant }: { variant: LinkPreviewVariant }) {
  const horizontal = variant === 'compact' || variant === 'row'
  return (
    <div className={cn('flex', horizontal ? 'items-start gap-3 p-3' : 'flex-col')}>
      <div className={cn('bg-accent shrink-0 animate-pulse motion-reduce:animate-none', MEDIA_BOX[variant])} />
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2', !horizontal && 'p-4')}>
        <div className='bg-accent h-3 w-1/3 animate-pulse rounded motion-reduce:animate-none' />
        <div className='bg-accent h-4 w-11/12 animate-pulse rounded motion-reduce:animate-none' />
        {variant !== 'compact' && <div className='bg-accent h-3 w-2/3 animate-pulse rounded motion-reduce:animate-none' />}
      </div>
    </div>
  )
}

const TITLE_CLASS: Record<LinkPreviewVariant, string> = {
  compact: 'text-sm line-clamp-1',
  row: 'text-sm sm:text-[15px] line-clamp-2',
  rich: 'text-[15px] line-clamp-2',
  hero: 'text-lg sm:text-xl line-clamp-3',
}

const DESC_CLASS: Record<LinkPreviewVariant, string | null> = {
  compact: null,
  row: 'hidden sm:[display:-webkit-box] line-clamp-2',
  rich: 'line-clamp-3',
  hero: 'line-clamp-4',
}

/**
 * Link preview card in four variants: `compact` (one line, list/sidebar),
 * `row` (square thumbnail + text, feeds on phones), `rich` (16:9 image on top,
 * grids) and `hero` (featured item). Fixed aspect ratios → no layout shift;
 * skeleton + blur while the image loads; favicon/domain/initial fallback when
 * there is no image or it fails. The whole card is clickable (stretched
 * link/button) while badges and the external link stay focusable.
 */
export function LinkPreviewCard({
  data,
  variant = 'rich',
  badges,
  meta,
  footer,
  href,
  onSelect,
  external = true,
  resolveImageUrl,
  locale = 'es',
  now,
  loading = false,
  className,
  ...props
}: LinkPreviewCardProps) {
  const es = isSpanish(locale)
  const domain = data.domain?.trim() || domainFromUrl(data.url)
  const linkHref = href === undefined ? data.url : href
  const title = data.title?.trim() || data.siteName?.trim() || domain || data.url
  const published = data.publishedAt ? toDate(data.publishedAt) : null
  const dateOnly = !!data.publishedAt && isDateOnly(data.publishedAt)
  const kindLabel = data.kind ? KIND_LABEL[es ? 'es' : 'en'][data.kind] : undefined
  const horizontal = variant === 'compact' || variant === 'row'
  const externalProps = external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}
  const openLabel = es ? `Abrir en ${domain}${external ? ' (pestaña nueva)' : ''}` : `Open on ${domain}${external ? ' (new tab)' : ''}`

  const root = cn(
    'group/link-preview bg-card text-card-foreground relative isolate flex overflow-hidden rounded-xl border shadow-xs transition-[border-color,box-shadow] motion-reduce:transition-none',
    // Outline (not ring): themes that restyle the card's box-shadow must not hide the focus.
    'has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 hover:border-foreground/20 hover:shadow-sm',
    horizontal ? 'flex-row items-start gap-3 p-3' : 'flex-col',
    className
  )

  if (loading) {
    return (
      <article
        aria-busy='true'
        data-slot='link-preview-card'
        data-variant={variant}
        className={cn(root, 'block p-0', horizontal && 'p-0')}
        {...props}
      >
        <span className='sr-only'>{es ? 'Cargando vista previa…' : 'Loading preview…'}</span>
        <CardSkeleton variant={variant} />
      </article>
    )
  }

  // Stretched primary action: its ::after covers the card.
  const stretched =
    'after:absolute after:inset-0 after:z-0 after:content-[""] focus-visible:outline-none rounded-sm text-left'
  const titleNode = onSelect ? (
    <button type='button' onClick={onSelect} className={cn(stretched, 'cursor-pointer')}>
      {title}
    </button>
  ) : linkHref ? (
    <a href={linkHref} {...externalProps} className={stretched}>
      {title}
    </a>
  ) : (
    title
  )
  const Heading = variant === 'hero' ? 'h2' : 'h3'
  const descClass = DESC_CLASS[variant]

  return (
    <article
      data-slot='link-preview-card'
      data-variant={variant}
      lang={data.lang || undefined}
      className={root}
      {...props}
    >
      <PreviewMedia
        variant={variant}
        imageUrl={data.imageUrl}
        domain={domain}
        siteName={data.siteName}
        faviconUrl={data.faviconUrl}
        kind={data.kind}
        kindLabel={kindLabel}
        resolveImageUrl={resolveImageUrl}
      />
      <div className={cn('flex min-w-0 flex-1 flex-col', horizontal ? 'gap-1' : 'gap-1.5 p-4', variant === 'hero' && 'sm:p-5')}>
        <div className='flex min-w-0 items-center gap-1.5'>
          <SourceBadge
            className='min-w-0'
            domain={domain}
            siteName={data.siteName}
            faviconUrl={data.faviconUrl}
            resolveImageUrl={resolveImageUrl}
            suffix={
              <>
                {published && (
                  <>
                    <span aria-hidden='true'>·</span>
                    <time
                      dateTime={dateOnly ? String(data.publishedAt).trim() : published.toISOString()}
                      title={
                        dateOnly
                          ? published.toLocaleDateString(locale, { dateStyle: 'long' })
                          : published.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' })
                      }
                      className='shrink-0 whitespace-nowrap'
                    >
                      {formatRelativeTime(dateOnly ? String(data.publishedAt).trim() : published, { now, locale })}
                    </time>
                  </>
                )}
                {horizontal && kindLabel && data.kind !== 'article' && data.kind !== 'other' && (
                  <>
                    <span aria-hidden='true'>·</span>
                    <span className='shrink-0'>{kindLabel}</span>
                  </>
                )}
              </>
            }
          />
          {linkHref && onSelect && (
            <a
              href={linkHref}
              {...externalProps}
              aria-label={openLabel}
              title={openLabel}
              className='text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 relative z-10 ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none'
            >
              <ExternalLink className='size-3.5' aria-hidden='true' />
            </a>
          )}
        </div>
        <Heading className={cn('text-foreground font-semibold text-pretty', TITLE_CLASS[variant], 'leading-snug')}>
          {titleNode}
        </Heading>
        {data.author && variant !== 'compact' && (
          <p className='text-muted-foreground truncate text-xs'>
            {es ? 'Por ' : 'By '}
            {data.author}
          </p>
        )}
        {descClass && data.description?.trim() && (
          <p className={cn('text-muted-foreground text-sm leading-relaxed', descClass)}>{data.description}</p>
        )}
        {meta && <div className='text-muted-foreground text-xs'>{meta}</div>}
        {badges && <div className='relative z-10 mt-0.5 flex flex-wrap items-center gap-1.5'>{badges}</div>}
        {footer && (
          <div className={cn('relative z-10', horizontal ? 'mt-1' : 'mt-auto border-t pt-3')}>{footer}</div>
        )}
      </div>
    </article>
  )
}
