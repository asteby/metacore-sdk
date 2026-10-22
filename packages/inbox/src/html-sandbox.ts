/**
 * Pure builder for the sandboxed document. Untrusted HTML goes in, a complete
 * `srcdoc` string comes out. Defence in depth: this strips active content,
 * but the real boundary is the iframe `sandbox` (no scripts) plus the CSP
 * meta emitted here, which blocks scripts, network and remote images.
 *
 * INVARIANT: the iframe must NEVER combine `allow-scripts` with
 * `allow-same-origin` (that pair lets the content remove its own sandbox).
 * This sanitizer is hand-rolled (the repo has no DOMPurify dependency); it is
 * hardened (SVG xlink:href, CSS url()/image-set(), <use>, entity-escaped CSS)
 * but remains defence in depth. If a sanitizer dependency is ever adopted,
 * swap it in here, keeping the CSP and the sandbox as the real boundary.
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

const REMOVE_TAGS = 'script,iframe,frame,frameset,object,embed,applet,link,meta,base,form,noscript,template,portal,audio,video,source,track,svg script,animate,set,foreignobject'
const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i
const REMOTE = /^(https?:)?\/\//i

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const stripControl = (v: string) => v.replace(/[\u0000-\u0020]/g, '')

/** Decode CSS hex escapes of "structural" characters so `\75rl(` cannot dodge the url() matcher. */
function decodeCssEscapes(css: string): string {
  return css.replace(/\\([0-9a-f]{1,6})\s?/gi, (m, hex: string) => {
    const c = parseInt(hex, 16)
    return /[a-z0-9()/:.\-]/i.test(String.fromCodePoint(c <= 0x10ffff ? c : 0xfffd)) ? String.fromCodePoint(c) : m
  })
}

/** CSP source for the image proxy: its origin, or 'self' when the rewrite is relative. */
function proxySource(rewrite: (url: string) => string, extra: Record<string, string> | undefined): string {
  const sources = new Set<string>()
  try {
    const u = new URL(rewrite('https://probe.invalid/x.png'), 'http://self.invalid')
    sources.add(u.origin === 'http://self.invalid' ? "'self'" : u.origin)
  } catch {
    sources.add("'self'")
  }
  for (const v of Object.values(extra ?? {})) {
    try {
      if (/^https?:/i.test(v)) sources.add(new URL(v).origin)
    } catch {
      /* ignore */
    }
  }
  return Array.from(sources).join(' ')
}

function cspFor(loadImages: boolean, proxy?: string): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: cid:${loadImages ? (proxy ? ` ${proxy}` : ' https: http:') : ''}`,
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function prepareHtml(raw: string, opts: PrepareHtmlOptions = {}): PreparedHtml {
  const { loadImages = false, inlineResources, rewriteImageUrl, hideQuoted = false, scheme = 'light' } = opts
  const csp = cspFor(loadImages, loadImages && rewriteImageUrl ? proxySource(rewriteImageUrl, inlineResources) : undefined)

  if (typeof DOMParser === 'undefined') {
    // No DOM to sanitize with: degrade to escaped text, never raw HTML.
    return { srcDoc: shell(csp, `<pre style="white-space:pre-wrap">${escapeHtml(raw)}</pre>`, false, scheme, false), remoteImageCount: 0, hasQuoted: false }
  }

  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll(REMOVE_TAGS).forEach((n) => n.remove())

  let remote = 0
  const toLoadable = (url: string) => {
    const abs = url.startsWith('//') ? `https:${url}` : url
    return rewriteImageUrl ? rewriteImageUrl(abs) : abs
  }

  // CSS: every url() / image-set() candidate that points at the network is
  // counted, and either neutralised or (opt-in) sent through the proxy.
  const rewriteCss = (input: string): string => {
    const css = decodeCssEscapes(input).replace(/@import[^;]*;?/gi, '')
    const token = /image-set\(((?:[^()]|\([^()]*\))*)\)|-webkit-image-set\(((?:[^()]|\([^()]*\))*)\)|url\(\s*(['"]?)([^'")]*)\3\s*\)/gi
    const inner = /url\(\s*(['"]?)([^'")]*)\1\s*\)|(["'])([^"']*)\3/gi
    return css.replace(token, (m, set1: string | undefined, set2: string | undefined, _q: string, u: string | undefined) => {
      const set = set1 ?? set2
      if (set !== undefined) {
        let any = false
        const out = set.replace(inner, (mm, _q1: string, uu: string | undefined, _q2: string, ss: string | undefined) => {
          const val = (uu ?? ss ?? '').trim()
          if (!REMOTE.test(val)) return mm
          any = true
          remote++
          return uu !== undefined ? `url("${toLoadable(val)}")` : `"${toLoadable(val)}"`
        })
        return any && !loadImages ? 'none' : m.replace(set, out)
      }
      const val = (u ?? '').trim()
      if (!REMOTE.test(val)) return m
      remote++
      return loadImages ? `url("${toLoadable(val)}")` : 'none'
    })
  }

  doc.querySelectorAll('style').forEach((st) => {
    st.textContent = rewriteCss(st.textContent ?? '')
  })

  // Remote or unknown image reference on an attribute. `inline` = cid:/blob: resolution makes sense (HTML <img>/<input>).
  const fixImageAttr = (el: Element, attr: string, inline: boolean) => {
    const src = (el.getAttribute(attr) ?? '').trim()
    if (!src) return
    if (/^cid:/i.test(src)) {
      const url = inline ? inlineResources?.[src.slice(4).replace(/^<|>$/g, '')] : undefined
      if (url && /^(blob:|data:image\/|https?:)/i.test(url)) el.setAttribute(attr, url)
      else el.removeAttribute(attr)
    } else if (REMOTE.test(src)) {
      remote++
      el.removeAttribute(attr)
      if (loadImages) el.setAttribute(attr, toLoadable(src))
      else el.setAttribute('data-blocked', 'true')
    } else if (!/^(data:image\/|blob:)/i.test(src)) {
      el.removeAttribute(attr)
    }
  }

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'ping' || name === 'lowsrc' || name === 'dynsrc') {
        el.removeAttribute(attr.name)
      } else if (name === 'style') {
        const css = rewriteCss(attr.value)
        if (/expression\(|javascript:/i.test(css)) el.removeAttribute('style')
        else el.setAttribute('style', css)
      } else if (name === 'background') {
        if (REMOTE.test(attr.value.trim())) remote++
        el.removeAttribute(attr.name)
      } else if (/^\s*(javascript|vbscript):/i.test(stripControl(attr.value)) && (name === 'href' || name === 'xlink:href' || name === 'src' || name === 'action')) {
        el.removeAttribute(attr.name)
      }
    }
  })

  // Links, including SVG <a xlink:href>. Fragment links stay in-document (no new window).
  doc.querySelectorAll('a, area').forEach((a) => {
    for (const name of ['href', 'xlink:href']) {
      if (!a.hasAttribute(name)) continue
      const href = stripControl(a.getAttribute(name) ?? '').trim()
      if (href.startsWith('#')) continue
      if (!SAFE_HREF.test(href)) a.removeAttribute(name)
      else {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    }
  })

  doc.querySelectorAll('img, input[type="image" i]').forEach((img) => {
    img.removeAttribute('srcset')
    img.setAttribute('referrerpolicy', 'no-referrer')
    img.setAttribute('loading', 'lazy')
    fixImageAttr(img, 'src', true)
  })

  // SVG: <image href|xlink:href> follows the image rules; <use> may only point at a fragment of this document.
  doc.querySelectorAll('image, feimage').forEach((el) => {
    for (const name of ['href', 'xlink:href']) if (el.hasAttribute(name)) fixImageAttr(el, name, false)
  })
  doc.querySelectorAll('use').forEach((el) => {
    for (const name of ['href', 'xlink:href']) {
      const v = (el.getAttribute(name) ?? '').trim()
      if (!el.hasAttribute(name)) continue
      if (!v.startsWith('#')) {
        if (REMOTE.test(v)) remote++
        el.removeAttribute(name)
      }
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
