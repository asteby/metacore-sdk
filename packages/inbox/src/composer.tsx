import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Bold, Italic, Link2, List, Loader2, Paperclip, Quote, Send, X } from 'lucide-react'
import type { InboxIdentity } from './types'
import { useInboxLabels, type InboxLabels } from './i18n'
import { createLocalDraftStore, type DraftStore } from './drafts'
import { markdownToHtml, prefixLines, wrapSelection } from './rich-text'
import { cx, FOCUS, formatBytes } from './utils'

export interface ComposerAttachment {
  id: string
  name: string
  size?: number
  mimeType?: string
  /** Present when no upload adapter is configured: you upload at send time. */
  file?: File
}

export interface ComposerValue {
  /** Markdown-flavoured plain text (the canonical body). */
  text: string
  /** Safe HTML alternative generated from `text`. */
  html: string
  subject?: string
  identityId?: string
  attachments: ComposerAttachment[]
}

export interface ComposerHandle {
  focus(): void
  clear(): void
}

export interface ComposerProps {
  /** Resolve to confirm; reject to keep the content and show the error. */
  onSend: (value: ComposerValue) => void | Promise<void>
  onDiscard?: () => void
  /** Stable key (conversation id). Enables draft autosave when set. */
  draftKey?: string
  draftStore?: DraftStore
  draftDelayMs?: number
  identities?: InboxIdentity[]
  identityId?: string
  onIdentityChange?: (id: string) => void
  showSubject?: boolean
  /** Fixed slot above the editor, e.g. recipient chips. */
  header?: ReactNode
  /** Upload each file as it is picked; omit to hand raw File objects to onSend. */
  uploadAttachment?: (file: File) => Promise<Omit<ComposerAttachment, 'file'>>
  maxAttachmentBytes?: number
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  labels?: Partial<InboxLabels>
  className?: string
}

interface Item extends ComposerAttachment {
  status: 'uploading' | 'ready' | 'error'
}

let seq = 0
const defaultStore = createLocalDraftStore()

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    onSend,
    onDiscard,
    draftKey,
    draftStore = defaultStore,
    draftDelayMs = 800,
    identities,
    identityId,
    onIdentityChange,
    showSubject,
    header,
    uploadAttachment,
    maxAttachmentBytes = 25 * 1024 * 1024,
    placeholder,
    disabled,
    autoFocus,
    labels: o,
    className,
  },
  ref,
) {
  const { labels } = useInboxLabels(o)
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [identity, setIdentity] = useState(identityId ?? identities?.[0]?.id)
  const [items, setItems] = useState<Item[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [linkOpen, setLinkOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [hydrated, setHydrated] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    if (identityId) setIdentity(identityId)
  }, [identityId])

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    clear: () => {
      setText('')
      setSubject('')
      setItems([])
    },
  }))

  // Autosize without a per-key React render of the surrounding tree: only this component updates.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [text])

  const pending = useRef<{ key: string; draft: Parameters<DraftStore['save']>[1] } | null>(null)
  // The key whose draft is loaded into the fields. Autosave only writes for this key,
  // so text typed in conversation A can never be saved under conversation B.
  const hydratedKey = useRef<string | null | undefined>(undefined)

  // Hydrate the draft when the key changes.
  useEffect(() => {
    setHydrated(false)
    hydratedKey.current = undefined
    pending.current = null
    dirty.current = false
    if (!draftKey) {
      hydratedKey.current = null
      setHydrated(true)
      return
    }
    let cancelled = false
    Promise.resolve(draftStore.load(draftKey)).then((d) => {
      if (cancelled) return
      // Never overwrite what the user already typed while the draft was loading.
      if (!dirty.current) {
        setText(d?.text ?? '')
        setSubject(d?.subject ?? '')
        if (d?.identityId) setIdentity(d.identityId)
        setItems((d?.attachments ?? []).map((a) => ({ ...a, status: 'ready' as const })))
      }
      hydratedKey.current = draftKey
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [draftKey, draftStore])

  // Debounced autosave; a flush on key change / unmount avoids losing the last words.
  const flush = useCallback(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const empty = !p.draft.text.trim() && !p.draft.subject && !p.draft.attachments?.length
    void Promise.resolve(empty ? draftStore.remove(p.key) : draftStore.save(p.key, p.draft)).then(() => setDraftState(empty ? 'idle' : 'saved'))
  }, [draftStore])

  useEffect(() => {
    if (!draftKey || !hydrated || hydratedKey.current !== draftKey) return
    const ready = items.filter((i) => i.status === 'ready' && !i.file).map(({ id, name, size }) => ({ id, name, size }))
    pending.current = { key: draftKey, draft: { text, subject: subject || undefined, identityId: identity, attachments: ready.length ? ready : undefined } }
    setDraftState('saving')
    const t = setTimeout(flush, draftDelayMs)
    return () => clearTimeout(t)
  }, [text, subject, identity, items, draftKey, draftDelayMs, flush, hydrated])

  useEffect(() => () => flush(), [flush, draftKey])

  const uploading = items.some((i) => i.status === 'uploading')
  const ready = items.filter((i) => i.status === 'ready')
  const canSend = !disabled && !sending && !uploading && (text.trim().length > 0 || ready.length > 0)

  const submit = useCallback(async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await onSend({
        text,
        html: markdownToHtml(text),
        subject: showSubject ? subject : undefined,
        identityId: identity,
        attachments: ready.map(({ status: _s, ...a }) => a),
      })
      pending.current = null
      if (draftKey) await draftStore.remove(draftKey)
      setText('')
      setSubject('')
      setItems([])
      setDraftState('idle')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : labels.errorBody)
    } finally {
      setSending(false)
    }
  }, [canSend, onSend, text, showSubject, subject, identity, ready, draftKey, draftStore, labels.errorBody])

  const apply = (r: { text: string; selStart: number; selEnd: number }) => {
    setText(r.text)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(r.selStart, r.selEnd)
    })
  }
  const sel = () => ({ s: area.current?.selectionStart ?? text.length, e: area.current?.selectionEnd ?? text.length })
  const wrap = (b: string, a = b) => {
    const { s, e } = sel()
    apply(wrapSelection(text, s, e, b, a))
  }
  const prefix = (p: string) => {
    const { s, e } = sel()
    apply(prefixLines(text, s, e, p))
  }
  const insertLink = (url: string) => {
    setLinkOpen(false)
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) return
    const { s, e } = sel()
    const label = text.slice(s, e) || url.trim()
    apply({ text: `${text.slice(0, s)}[${label}](${url.trim()})${text.slice(e)}`, selStart: s, selEnd: s + label.length + url.trim().length + 4 })
  }

  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const localId = `local-${++seq}`
      if (file.size > maxAttachmentBytes) {
        setItems((p) => [...p, { id: localId, name: file.name, size: file.size, status: 'error' }])
        continue
      }
      if (!uploadAttachment) {
        setItems((p) => [...p, { id: localId, name: file.name, size: file.size, mimeType: file.type, file, status: 'ready' }])
        continue
      }
      setItems((p) => [...p, { id: localId, name: file.name, size: file.size, status: 'uploading' }])
      uploadAttachment(file).then(
        (r) => setItems((p) => p.map((i) => (i.id === localId ? { ...r, status: 'ready' } : i))),
        () => setItems((p) => p.map((i) => (i.id === localId ? { ...i, status: 'error' } : i))),
      )
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'Enter') (e.preventDefault(), void submit())
    else if (mod && e.key.toLowerCase() === 'b') (e.preventDefault(), wrap('**'))
    else if (mod && e.key.toLowerCase() === 'i') (e.preventDefault(), wrap('*'))
    else if (mod && e.key.toLowerCase() === 'k') (e.preventDefault(), setLinkOpen(true))
    else if (e.key === 'Escape') e.currentTarget.blur()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  const tool = cx('inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40', FOCUS)

  return (
    <form
      onSubmit={(e) => (e.preventDefault(), void submit())}
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-busy={sending}
      className={cx(
        'relative flex min-h-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:shadow-md motion-reduce:transition-none',
        className,
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-background/80 text-sm font-medium text-primary">
          {labels.dropFiles}
        </div>
      )}
      {(identities && identities.length > 0) || header ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {identities && identities.length > 0 && (
            <label className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">{labels.sendAs}</span>
              <select
                value={identity}
                disabled={identities.length < 2 || disabled}
                onChange={(e) => {
                  setIdentity(e.target.value)
                  onIdentityChange?.(e.target.value)
                }}
                className={cx('max-w-56 truncate rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground', FOCUS)}
              >
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.description ? `${i.label} <${i.description}>` : i.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {header}
        </div>
      ) : null}
      {showSubject && (
        <input
          aria-label={labels.subject}
          placeholder={labels.subject}
          value={subject}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
          className="border-b border-border/50 bg-transparent pb-2 text-sm font-medium outline-none placeholder:text-muted-foreground"
        />
      )}
      <textarea
        ref={area}
        aria-label={placeholder ?? labels.placeholder}
        placeholder={placeholder ?? labels.placeholder}
        value={text}
        rows={3}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => {
          dirty.current = true
          setText(e.target.value)
        }}
        onKeyDown={onKeyDown}
        className="max-h-80 min-h-20 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      {linkOpen && (
        <input
          autoFocus
          type="url"
          aria-label={labels.linkPrompt}
          placeholder="https://"
          className={cx('rounded-lg border border-border bg-background px-3 py-1.5 text-sm', FOCUS)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), insertLink(e.currentTarget.value))
            else if (e.key === 'Escape') (e.stopPropagation(), setLinkOpen(false), area.current?.focus())
          }}
          onBlur={() => setLinkOpen(false)}
        />
      )}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={labels.attachments}>
          {items.map((i) => (
            <li
              key={i.id}
              className={cx(
                'flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs',
                i.status === 'error' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-muted/50',
              )}
            >
              {i.status === 'uploading' && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
              <span className="max-w-40 truncate font-medium">{i.name}</span>
              <span className="text-muted-foreground">{i.status === 'error' ? labels.uploadFailed : formatBytes(i.size)}</span>
              <button
                type="button"
                aria-label={`${labels.removeAttachment}: ${i.name}`}
                className={cx('rounded-full p-0.5 hover:bg-muted', FOCUS)}
                onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1">
        <div role="toolbar" aria-label={labels.formatting} className="flex items-center gap-0.5">
          <button type="button" className={tool} aria-label={labels.bold} title={`${labels.bold} (Ctrl/⌘ B)`} onClick={() => wrap('**')}>
            <Bold className="size-4" aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={labels.italic} title={`${labels.italic} (Ctrl/⌘ I)`} onClick={() => wrap('*')}>
            <Italic className="size-4" aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={labels.link} title={`${labels.link} (Ctrl/⌘ K)`} onClick={() => setLinkOpen(true)}>
            <Link2 className="size-4" aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={labels.list} onClick={() => prefix('- ')}>
            <List className="size-4" aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={labels.quote} onClick={() => prefix('> ')}>
            <Quote className="size-4" aria-hidden />
          </button>
          <button type="button" className={tool} aria-label={labels.attach} onClick={() => fileInput.current?.click()} disabled={disabled}>
            <Paperclip className="size-4" aria-hidden />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="composer-file-input"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        <span className="ml-auto mr-2 hidden text-xs text-muted-foreground sm:inline" role="status" aria-live="polite">
          {draftState === 'saving' ? labels.draftSaving : draftState === 'saved' ? labels.draftSaved : ''}
        </span>
        {onDiscard && (
          <button type="button" onClick={onDiscard} className={cx('min-h-9 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted', FOCUS)}>
            {labels.discard}
          </button>
        )}
        <button
          type="submit"
          disabled={!canSend}
          className={cx(
            'inline-flex min-h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-[opacity,transform] duration-150 active:scale-95 disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100',
            draftState === 'idle' && 'ml-auto',
            FOCUS,
          )}
        >
          {sending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {sending ? labels.sending : labels.send}
        </button>
      </div>
    </form>
  )
})
