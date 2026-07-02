/**
 * Rich URL & media rendering primitives.
 *
 * A URL is never shown raw. Depending on what it points at we render:
 *   - an IMAGE (jpg/png/gif/webp/… or a `link.asteby.com/storage/media/` path)
 *     → an inline clickable THUMBNAIL that opens the full image in a new tab,
 *   - a FILE (pdf/zip/docx/…) → a chip with a file icon and the file name,
 *   - anything else → a compact link CHIP: an external-link glyph plus a short
 *     smart label (hostname, e.g. "github.com", or the last path segment for a
 *     file-like URL), with the full URL in a native tooltip.
 *
 * These live here (not inline in the table/dialog) so the dynamic TABLE cell
 * (`dynamic-columns.tsx`) and the read-only DETAIL DIALOG (`dynamic-record.tsx`)
 * share the EXACT same rendering. Ecosystem rule: shared primitives, zero copy.
 *
 * No external requests are made to render a link (no favicon service — CSP /
 * privacy): the icon is a local lucide glyph.
 */
import React from 'react'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from './dynamic-icon'

/** Image file extensions we render as an inline thumbnail. */
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)(?:[?#].*)?$/i

/**
 * Storage paths that serve images without a file extension (the link.asteby.com
 * media CDN hands back opaque ids). Treated as images so uploaded photos still
 * thumbnail.
 */
const MEDIA_PATH_RE = /\/storage\/media\//i

/** Non-image file extensions we render as a download-ish file chip. */
const FILE_EXT_RE =
    /\.(pdf|zip|rar|7z|tar|t?gz|docx?|xlsx?|pptx?|csv|txt|json|xml|md|rtf|odt|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|apk|dmg|exe|pkg)(?:[?#].*)?$/i

export type UrlKind = 'image' | 'file' | 'link'

/** `true` when the string looks like an image URL/path. */
export function isImageUrl(url: string): boolean {
    return IMAGE_EXT_RE.test(url) || MEDIA_PATH_RE.test(url)
}

/** `true` when the string looks like a non-image downloadable file. */
export function isFileUrl(url: string): boolean {
    return FILE_EXT_RE.test(url)
}

/** Classify a URL so the right primitive (thumbnail / file chip / link) renders. */
export function classifyUrl(url: string): UrlKind {
    if (isImageUrl(url)) return 'image'
    if (isFileUrl(url)) return 'file'
    return 'link'
}

/** Ensure a URL is absolute so `<a href>` and `new URL()` behave. */
export function ensureHref(url: string): string {
    return /^(https?:)?\/\//i.test(url) || /^(mailto|tel):/i.test(url)
        ? url
        : `https://${url}`
}

/**
 * A short, human label for a URL. For a file-like URL (last segment carries an
 * extension) the file name wins ("report.pdf"); otherwise the bare hostname
 * ("github.com"), so a 120-char issue URL never shows raw. Falls back to the
 * input when it can't be parsed.
 */
export function smartUrlLabel(url: string): string {
    try {
        const u = new URL(ensureHref(url))
        const segs = u.pathname.split('/').filter(Boolean)
        const last = segs[segs.length - 1]
        if (last && /\.[a-z0-9]{1,8}$/i.test(last)) {
            return decodeURIComponent(last)
        }
        return u.hostname.replace(/^www\./i, '')
    } catch {
        return url
    }
}

/** Last path segment (decoded) — the file name for a file/image URL. */
export function fileNameFromUrl(url: string): string {
    try {
        const u = new URL(ensureHref(url))
        const segs = u.pathname.split('/').filter(Boolean)
        return decodeURIComponent(segs[segs.length - 1] || u.hostname)
    } catch {
        return url.split(/[?#]/)[0].split('/').pop() || url
    }
}

/** Stops row-click / dialog-close when a link inside them is clicked. */
function stop(e: React.MouseEvent) {
    e.stopPropagation()
}

/**
 * Compact link chip: external-link glyph + smart label, full URL in the
 * tooltip, opens in a new tab. The canonical render for a plain (non-media)
 * URL, matching the table's `url`/`link` cell.
 */
export const UrlChip: React.FC<{
    url: string
    label?: string
    icon?: string
    /** Smaller label cap for a table/kanban cell. */
    maxLabelWidth?: number
    className?: string
}> = ({ url, label, icon, maxLabelWidth = 260, className }) => {
    const href = ensureHref(url)
    const text = label || smartUrlLabel(url)
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            onClick={stop}
            className={cn(
                'inline-flex max-w-full items-center gap-1.5 align-middle text-sm font-medium text-primary hover:underline',
                className
            )}
        >
            <DynamicIcon name={icon || 'ExternalLink'} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" style={{ maxWidth: maxLabelWidth }}>
                {text}
            </span>
        </a>
    )
}

/**
 * Chip for a downloadable non-image file: file-text glyph + the file name,
 * opens the file in a new tab.
 */
export const FileChip: React.FC<{
    url: string
    maxLabelWidth?: number
    className?: string
}> = ({ url, maxLabelWidth = 240, className }) => {
    const href = ensureHref(url)
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            onClick={stop}
            className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 align-middle text-sm font-medium text-foreground hover:bg-muted',
                className
            )}
        >
            <DynamicIcon name="FileText" className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate" style={{ maxWidth: maxLabelWidth }}>
                {fileNameFromUrl(url)}
            </span>
        </a>
    )
}

/**
 * Inline image thumbnail — rounded, bordered, `object-cover` — that opens the
 * full image in a new tab. On load error it degrades to a normal link chip so a
 * dead image URL is still reachable (and never a broken-image icon). `maxHeight`
 * keeps a cell thumbnail small (~h-8) while the dialog shows a larger preview.
 */
export const ImageThumbnail: React.FC<{
    url: string
    getImageUrl?: (path: string) => string
    /** Max rendered height in px. */
    maxHeight?: number
    className?: string
}> = ({ url, getImageUrl, maxHeight = 160, className }) => {
    const [failed, setFailed] = React.useState(false)
    const href = ensureHref(url)
    // Absolute URLs are used verbatim; only relative storage paths go through
    // the host's image resolver (which prefixes the media base).
    const src =
        /^(https?:)?\/\//i.test(url) ? url : getImageUrl ? getImageUrl(url) : url
    if (failed) return <UrlChip url={url} icon="Image" />
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            onClick={stop}
            className="inline-block max-w-full align-middle"
        >
            <img
                src={src}
                alt={smartUrlLabel(url)}
                onError={() => setFailed(true)}
                style={{ maxHeight }}
                className={cn(
                    'max-w-full rounded-md border object-cover',
                    className
                )}
            />
        </a>
    )
}

/**
 * One URL value → the right primitive (thumbnail / file chip / link chip).
 * Single entry point used by both the table cell and the detail dialog so a URL
 * renders identically everywhere.
 */
export const MediaValue: React.FC<{
    url: string
    getImageUrl?: (path: string) => string
    /** Explicit label for the link chip (from a `label_field`). */
    label?: string
    /** Explicit icon for the link chip. */
    icon?: string
    /** Thumbnail max height (small in a cell, larger in the dialog). */
    thumbHeight?: number
    /** Link/file label truncation cap. */
    maxLabelWidth?: number
    className?: string
}> = ({ url, getImageUrl, label, icon, thumbHeight, maxLabelWidth, className }) => {
    switch (classifyUrl(url)) {
        case 'image':
            return (
                <ImageThumbnail
                    url={url}
                    getImageUrl={getImageUrl}
                    maxHeight={thumbHeight}
                    className={className}
                />
            )
        case 'file':
            return <FileChip url={url} maxLabelWidth={maxLabelWidth} className={className} />
        default:
            return (
                <UrlChip
                    url={url}
                    label={label}
                    icon={icon}
                    maxLabelWidth={maxLabelWidth}
                    className={className}
                />
            )
    }
}

// URL / markdown-link matcher used to linkify free text. Captures either a
// markdown `[label](url)` or a bare http(s)/www URL. `[^\s<]+` is greedy on
// purpose — trailing punctuation is trimmed afterwards by `splitTrailingPunct`.
const LINK_IN_TEXT_RE =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

/**
 * Peel trailing punctuation a URL shouldn't swallow (sentence period, closing
 * bracket, quote). A closing paren is kept only when the URL itself opened one
 * (Wikipedia-style `(…)` paths), so `(see https://x.com/a)` links `https://x.com/a`
 * but `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its paren.
 */
export function splitTrailingPunct(match: string): [string, string] {
    const m = match.match(/[).,;:!?\]}'"»›]+$/)
    if (!m) return [match, '']
    let trail = m[0]
    let core = match.slice(0, match.length - trail.length)
    if (trail.startsWith(')')) {
        const opens = (core.match(/\(/g) || []).length
        const closes = (core.match(/\)/g) || []).length
        if (opens > closes) {
            core += ')'
            trail = trail.slice(1)
        }
    }
    return [core, trail]
}

export interface LinkifyOptions {
    getImageUrl?: (path: string) => string
    /** Max height for an inline image found in the text. */
    imageHeight?: number
}

/**
 * Turn free text into React nodes, replacing every URL (bare or markdown
 * `[label](url)`) with the matching rich primitive: an inline thumbnail for an
 * image URL, a file chip for a file, otherwise a link chip. Plain text between
 * matches is preserved verbatim (caller keeps `whitespace-pre-wrap`).
 */
export function linkifyText(
    text: string,
    opts: LinkifyOptions = {}
): React.ReactNode[] {
    if (!text) return []
    const nodes: React.ReactNode[] = []
    const re = new RegExp(LINK_IN_TEXT_RE.source, 'gi')
    let lastIndex = 0
    let key = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        const [full, mdLabel, mdUrl, bareUrl] = m
        const start = m.index
        if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

        if (mdUrl) {
            // Markdown link: honor the author's label, keep media inline.
            const kind = classifyUrl(mdUrl)
            if (kind === 'image') {
                nodes.push(
                    <ImageThumbnail
                        key={key}
                        url={mdUrl}
                        getImageUrl={opts.getImageUrl}
                        maxHeight={opts.imageHeight ?? 200}
                    />
                )
            } else if (kind === 'file') {
                nodes.push(<FileChip key={key} url={mdUrl} />)
            } else {
                nodes.push(<UrlChip key={key} url={mdUrl} label={mdLabel} />)
            }
            lastIndex = start + full.length
        } else {
            const [core, trail] = splitTrailingPunct(bareUrl)
            const kind = classifyUrl(core)
            if (kind === 'image') {
                nodes.push(
                    <ImageThumbnail
                        key={key}
                        url={core}
                        getImageUrl={opts.getImageUrl}
                        maxHeight={opts.imageHeight ?? 200}
                    />
                )
            } else if (kind === 'file') {
                nodes.push(<FileChip key={key} url={core} />)
            } else {
                nodes.push(<UrlChip key={key} url={core} />)
            }
            if (trail) nodes.push(trail)
            lastIndex = start + bareUrl.length
        }
        key++
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
    return nodes
}

/**
 * Linkified free text. Renders the raw string with every URL turned into a rich
 * chip/thumbnail — the read view for a long-text / textarea / body field.
 */
export const RichText: React.FC<{
    text: string
    getImageUrl?: (path: string) => string
    imageHeight?: number
}> = ({ text, getImageUrl, imageHeight }) => (
    <>{linkifyText(text, { getImageUrl, imageHeight })}</>
)
