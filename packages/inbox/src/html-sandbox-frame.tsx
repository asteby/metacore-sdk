import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useInboxLabels, type InboxLabels } from './i18n'
import { prepareHtml } from './html-sandbox'
import { cx, FOCUS } from './utils'

export interface HtmlSandboxFrameProps {
  /** Untrusted HTML. */
  html: string
  /** Remote images start blocked; the user opts in per message. */
  loadImagesByDefault?: boolean
  /** Called when the user opts in (e.g. to remember the sender as trusted). */
  onLoadImages?: () => void
  inlineResources?: Record<string, string>
  rewriteImageUrl?: (url: string) => string
  /** Collapse quoted history behind a toggle. */
  collapseQuoted?: boolean
  /** 'auto' follows `html.dark` / prefers-color-scheme. */
  scheme?: 'light' | 'dark' | 'auto'
  title?: string
  labels?: Partial<InboxLabels>
  className?: string
}

function useScheme(pref: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
  const [auto, setAuto] = useState<'light' | 'dark'>(() => detect())
  useEffect(() => {
    if (pref !== 'auto' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const fn = () => setAuto(detect())
    mq.addEventListener?.('change', fn)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(fn) : null
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => {
      mq.removeEventListener?.('change', fn)
      mo?.disconnect()
    }
  }, [pref])
  return pref === 'auto' ? auto : pref
}

function detect(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  const root = document.documentElement
  if (root.classList.contains('dark') || root.dataset.theme === 'dark') return 'dark'
  if (root.classList.contains('light') || root.dataset.theme === 'light') return 'light'
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Renders untrusted HTML in an iframe with no script capability:
 * `sandbox` without allow-scripts, plus a strict CSP in the document.
 * INVARIANT: never add `allow-scripts` next to `allow-same-origin`.
 * `allow-same-origin` is granted only so the host can measure the height;
 * with scripts disabled it cannot be used to reach the host page.
 * Styles cannot leak either way because the document is isolated.
 */
export function HtmlSandboxFrame({
  html,
  loadImagesByDefault = false,
  onLoadImages,
  inlineResources,
  rewriteImageUrl,
  collapseQuoted = false,
  scheme = 'auto',
  title,
  labels: o,
  className,
}: HtmlSandboxFrameProps) {
  const { labels } = useInboxLabels(o)
  const [loadImages, setLoadImages] = useState(loadImagesByDefault)
  const [showQuoted, setShowQuoted] = useState(false)
  const resolved = useScheme(scheme)
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(80)

  const prepared = useMemo(
    () => prepareHtml(html, { loadImages, inlineResources, rewriteImageUrl, hideQuoted: collapseQuoted && !showQuoted, scheme: resolved }),
    [html, loadImages, inlineResources, rewriteImageUrl, collapseQuoted, showQuoted, resolved],
  )

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let ro: ResizeObserver | undefined
    const measure = () => {
      const d = frame.contentDocument
      if (d?.documentElement) setHeight(Math.max(40, Math.ceil(d.documentElement.scrollHeight)))
    }
    const onLoad = () => {
      measure()
      const d = frame.contentDocument
      if (d?.body && typeof ResizeObserver !== 'undefined') {
        ro?.disconnect()
        ro = new ResizeObserver(measure)
        ro.observe(d.body)
      }
    }
    frame.addEventListener('load', onLoad)
    if (frame.contentDocument?.readyState === 'complete') onLoad()
    return () => {
      frame.removeEventListener('load', onLoad)
      ro?.disconnect()
    }
  }, [prepared.srcDoc])

  const btn = cx('rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted', FOCUS)

  return (
    <div className={cx('space-y-2', className)}>
      {prepared.remoteImageCount > 0 && !loadImages && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <ImageOff className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{labels.imagesBlocked}</span>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setLoadImages(true)
              onLoadImages?.()
            }}
          >
            {labels.loadImages}
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title={title ?? labels.htmlFrameTitle}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={prepared.srcDoc}
        scrolling="no"
        style={{ height, colorScheme: resolved }}
        className="block w-full border-0 bg-transparent"
      />
      {collapseQuoted && prepared.hasQuoted && (
        <button type="button" className={btn} aria-expanded={showQuoted} onClick={() => setShowQuoted((v) => !v)}>
          {showQuoted ? labels.hideQuoted : labels.showQuoted}
        </button>
      )}
    </div>
  )
}
