import { memo, useState, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { AGENT_FOCUS } from './surfaces'
import { closeOpenFences, normalizeMarkdown } from './text/normalize'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

export interface MarkdownProps {
  content: string
  className?: string
  /** The text is still being typed in: unterminated code fences are closed virtually. */
  streaming?: boolean
  /**
   * Intercept link clicks (SPA navigation for in-app links). Return `true` when
   * handled; the browser navigation is then cancelled. Receives the raw href.
   */
  onLinkClick?: (href: string, event: MouseEvent<HTMLAnchorElement>) => boolean | void
  /** Label of the code copy button. */
  copyLabel?: string
  copiedLabel?: string
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

function CodeBlock({ children, copyLabel, copiedLabel }: { children: ReactNode; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure context / denied) */
    }
  }
  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-lg border border-[color:var(--border-rim,var(--border))] bg-background/50 p-3 pr-12 text-xs leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? copiedLabel : copyLabel}
        title={copied ? copiedLabel : copyLabel}
        className={cx(
          'absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-md border bg-background/80 text-muted-foreground transition-opacity hover:text-foreground',
          'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
          AGENT_FOCUS,
        )}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </div>
  )
}

const SAFE_IMG = /^(https?:\/\/|\/(?!\/))/i

function buildComponents(opts: Pick<MarkdownProps, 'onLinkClick' | 'copyLabel' | 'copiedLabel'>): Components {
  const copyLabel = opts.copyLabel ?? 'Copiar código'
  const copiedLabel = opts.copiedLabel ?? 'Copiado'
  return {
    p: (p) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...strip(p)} />,
    h1: (p) => <h3 className="mb-1 mt-3 text-base font-semibold first:mt-0" {...strip(p)} />,
    h2: (p) => <h3 className="mb-1 mt-3 text-[15px] font-semibold first:mt-0" {...strip(p)} />,
    h3: (p) => <h4 className="mb-1 mt-2.5 text-sm font-semibold first:mt-0" {...strip(p)} />,
    h4: (p) => <h5 className="mb-1 mt-2 text-sm font-medium first:mt-0" {...strip(p)} />,
    h5: (p) => <h5 className="mb-1 mt-2 text-sm font-medium first:mt-0" {...strip(p)} />,
    h6: (p) => <h5 className="mb-1 mt-2 text-sm font-medium first:mt-0" {...strip(p)} />,
    ul: (p) => <ul className="my-1.5 list-disc space-y-1 pl-5" {...strip(p)} />,
    ol: (p) => <ol className="my-1.5 list-decimal space-y-1 pl-5" {...strip(p)} />,
    li: (p) => <li className="leading-snug marker:text-muted-foreground" {...strip(p)} />,
    hr: () => <hr className="my-3 border-border/60" />,
    blockquote: (p) => (
      <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground" {...strip(p)} />
    ),
    a: ({ href, children }) => {
      const url = href ?? ''
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={cx('text-primary underline underline-offset-2 hover:opacity-80', AGENT_FOCUS)}
          onClick={(e) => {
            if (opts.onLinkClick?.(url, e)) e.preventDefault()
          }}
        >
          {children}
        </a>
      )
    },
    img: ({ src, alt }) =>
      typeof src === 'string' && SAFE_IMG.test(src) ? (
        <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" className="my-2 max-w-full rounded-lg" />
      ) : (
        <span className="text-muted-foreground">{alt}</span>
      ),
    pre: ({ children }) => (
      <CodeBlock copyLabel={copyLabel} copiedLabel={copiedLabel}>
        {children}
      </CodeBlock>
    ),
    code: ({ className, children }) =>
      /language-/.test(className ?? '') || String(children).includes('\n') ? (
        <code className={cx('font-mono', className)}>{children}</code>
      ) : (
        <code className="rounded bg-background/50 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
      ),
    table: ({ children }) => (
      <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-[color:var(--border-rim,var(--border))]">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    ),
    thead: (p) => <thead className="bg-muted/60" {...strip(p)} />,
    th: (p) => <th className="whitespace-nowrap border-b px-2.5 py-1.5 text-left font-semibold" {...strip(p)} />,
    td: (p) => <td className="border-b border-border/40 px-2.5 py-1.5 align-top" {...strip(p)} />,
  }
}

/** Drop react-markdown's `node` prop so it never reaches the DOM. */
function strip<T extends { node?: unknown }>(p: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = p
  return rest
}

/**
 * Safe Markdown + GFM for AI replies. No raw HTML (react-markdown drops it),
 * dangerous URL schemes are neutralised by `defaultUrlTransform`, links open
 * with `noopener noreferrer`, images are limited to http(s)/same-origin.
 * Styled with theme tokens only (no typography plugin needed).
 */
export const Markdown = memo(function Markdown({ content, className, streaming, onLinkClick, copyLabel, copiedLabel }: MarkdownProps) {
  const source = normalizeMarkdown(streaming ? closeOpenFences(content) : content)
  return (
    <div className={cx('min-w-0 break-words text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={defaultUrlTransform}
        components={buildComponents({ onLinkClick, copyLabel, copiedLabel })}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
