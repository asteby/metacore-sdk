/**
 * Pure builder for the sandboxed document. Untrusted HTML goes in, a complete
 * `srcdoc` string comes out. Defence in depth: this strips active content,
 * but the real boundary is the iframe `sandbox` (no scripts) plus the CSP
 * meta emitted here, which blocks scripts, network and remote images.
 */

export interface PrepareHtmlOptions {
  /** Allow https/http images. Off by default (tracking pixels, IP leaks). */
  loadImages?: boolean
  /** `cid:` -> loadable URL (blob:/data:/signed URL). */
  inlineResources?: Record<string, string>
  /** Rewrite remote image URLs (e.g. through an image proxy) when loading is on. */
  rewriteImageUrl?: (url: string) => string
  /** Hide quoted history (replies, forwards). */
  hideQuoted?: boolean
  /** Resolved color scheme of the host app. */
  scheme?: 'light' | 'dark'
}

export interface PreparedHtml {
  srcDoc: string
  /** Remote images found in the message (blocked unless `loadImages`). */
  remoteImageCount: number
  hasQuoted: boolean
}

export const QUOTE_SELECTOR = '.gmail_quote, .gmail_extra, .yahoo_quoted, blockquote[type="cite"], #divRplyFwdMsg, .moz-cite-prefix, #appendonsend'

const REMOVE_TAGS = 'script,iframe,frame,frameset,object,embed,applet,link,meta,base,form,noscript,template,portal,audio,video,source,track,svg script'
const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i
const REMOTE = /^(https?:)?\/\//i

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cspFor(loadImages: boolean): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: cid:${loadImages ? ' https: http:' : ''}`,
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function prepareHtml(raw: string, opts: PrepareHtmlOptions = {}): PreparedHtml {
  const { loadImages = false, inlineResources, rewriteImageUrl, hideQuoted = false, scheme = 'light' } = opts
  const csp = cspFor(loadImages)

  if (typeof DOMParser === 'undefined') {
    // No DOM to sanitize with: degrade to escaped text, never raw HTML.
    return { srcDoc: shell(csp, `<pre style="white-space:pre-wrap">${escapeHtml(raw)}</pre>`, false, scheme, false), remoteImageCount: 0, hasQuoted: false }
  }

  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll(REMOVE_TAGS).forEach((n) => n.remove())

  let remote = 0
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'ping') {
        el.removeAttribute(attr.name)
      } else if (name === 'style') {
        if (/url\(\s*['"]?\s*(https?:)?\/\//i.test(attr.value)) {
          remote++
          if (!loadImages) el.setAttribute('style', attr.value.replace(/url\(\s*['"]?\s*(https?:)?\/\/[^)]*\)/gi, 'none'))
        }
        if (/expression\(|javascript:/i.test(attr.value)) el.removeAttribute('style')
      } else if (name === 'background') {
        el.removeAttribute(attr.name)
      }
    }
  })

  doc.querySelectorAll('a[href], area[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!SAFE_HREF.test(href.trim())) a.removeAttribute('href')
    else {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })

  doc.querySelectorAll('img').forEach((img) => {
    img.removeAttribute('srcset')
    img.setAttribute('referrerpolicy', 'no-referrer')
    img.setAttribute('loading', 'lazy')
    const src = (img.getAttribute('src') ?? '').trim()
    if (/^cid:/i.test(src)) {
      const url = inlineResources?.[src.slice(4).replace(/^<|>$/g, '')]
      if (url && /^(blob:|data:image\/|https?:)/i.test(url)) img.setAttribute('src', url)
      else img.removeAttribute('src')
    } else if (REMOTE.test(src)) {
      remote++
      img.removeAttribute('src')
      if (loadImages) img.setAttribute('src', rewriteImageUrl ? rewriteImageUrl(src.startsWith('//') ? `https:${src}` : src) : src)
      else img.setAttribute('data-blocked', 'true')
    } else if (!/^(data:image\/|blob:)/i.test(src)) {
      img.removeAttribute('src')
    }
  })

  const hasQuoted = !!doc.querySelector(QUOTE_SELECTOR)
  const styled = !!doc.querySelector('style, [bgcolor], [style*="background"], [style*="color"], font[color]')
  return { srcDoc: shell(csp, doc.body.innerHTML, hideQuoted && hasQuoted, scheme, styled, Array.from(doc.querySelectorAll('style')).map((s) => s.outerHTML).join('')), remoteImageCount: remote, hasQuoted }
}

function shell(csp: string, body: string, hideQuoted: boolean, scheme: 'light' | 'dark', ownStyling: boolean, headStyles = ''): string {
  // Self-styled newsletters assume a white page: keep them readable on a
  // light surface in dark mode. Plain messages follow the host theme.
  const dark = scheme === 'dark' && !ownStyling
  const fg = dark ? '#e7e7ea' : '#1c1c1e'
  const bg = ownStyling ? '#ffffff' : 'transparent'
  const link = dark ? '#7db4ff' : '#0a62d0'
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="${dark ? 'dark' : 'light'}"><style>
html,body{margin:0;padding:0}
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${fg};background:${bg};overflow-wrap:anywhere;word-break:break-word;padding:2px}
a{color:${link}}
img{max-width:100%;height:auto}
img[data-blocked]{display:inline-block;min-width:16px;min-height:16px;background:rgba(127,127,127,.14);border-radius:4px}
table{max-width:100%}
blockquote{margin:0 0 0 .4em;padding-left:.8em;border-left:2px solid rgba(127,127,127,.4)}
pre{white-space:pre-wrap}
${hideQuoted ? `${QUOTE_SELECTOR}{display:none!important}` : ''}
</style>${headStyles}</head><body>${body}</body></html>`
}

/** Escaped plain text -> minimal HTML paragraphs (used by composers for the HTML alternative). */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
}
