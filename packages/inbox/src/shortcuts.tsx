import { useEffect, useRef } from 'react'
import { useInboxLabels, type InboxLabels } from './i18n'
import { cx } from './utils'

/** Action name -> key combo. `mod` is Cmd on macOS and Ctrl elsewhere. */
export type Keymap = Record<string, string>

export const DEFAULT_KEYMAP = {
  next: 'j',
  prev: 'k',
  archive: 'e',
  reply: 'r',
  replyAll: 'a',
  delete: '#',
  compose: 'c',
  search: '/',
  send: 'mod+enter',
  help: '?',
} as const satisfies Keymap

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** True when the combo matches the event. Single printable keys ignore Shift (so `#` and `?` work on any layout). */
export function matchShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, combo: string, mac = isMac()): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts.pop() ?? ''
  const wantMod = parts.includes('mod')
  const wantShift = parts.includes('shift')
  const wantAlt = parts.includes('alt')
  const mod = mac ? e.metaKey : e.ctrlKey
  if (wantMod !== mod) return false
  if (!wantMod && (e.metaKey || e.ctrlKey)) return false
  if (wantAlt !== e.altKey) return false
  if (wantShift && !e.shiftKey) return false
  const k = e.key.toLowerCase()
  const printable = key.length === 1 && !/[a-z0-9]/.test(key)
  if (!wantShift && !printable && e.shiftKey && !wantMod) return false
  return k === key
}

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

function isTyping(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest(TYPING)
}

export interface UseInboxShortcutsOptions {
  enabled?: boolean
  /** Overrides on top of DEFAULT_KEYMAP. Set an action to '' to unbind it. */
  keymap?: Partial<Keymap>
  /** Element to listen on; defaults to window. */
  target?: HTMLElement | Window | null
}

/**
 * Superhuman-style single-key shortcuts. Plain keys are ignored while the
 * user is typing in a field; combos with `mod` (e.g. cmd+enter) still fire.
 * Handlers are read from a ref, so passing fresh closures never re-subscribes.
 */
export function useInboxShortcuts(handlers: Partial<Record<string, (e: KeyboardEvent) => void>>, options: UseInboxShortcutsOptions = {}) {
  const { enabled = true, keymap, target } = options
  const ref = useRef(handlers)
  ref.current = handlers
  const km = useRef<Keymap>({})
  km.current = { ...DEFAULT_KEYMAP, ...keymap } as Keymap

  useEffect(() => {
    if (!enabled) return
    const el: HTMLElement | Window | null = target === undefined ? (typeof window === 'undefined' ? null : window) : target
    if (!el) return
    const onKey = (ev: Event) => {
      const e = ev as KeyboardEvent
      if (e.defaultPrevented || e.isComposing) return
      const typing = isTyping(e.target)
      for (const [action, combo] of Object.entries(km.current)) {
        const fn = ref.current[action]
        if (!fn || !combo) continue
        if (typing && !combo.toLowerCase().includes('mod+')) continue
        if (matchShortcut(e, combo)) {
          e.preventDefault()
          fn(e)
          return
        }
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [enabled, target])
}

export function formatCombo(combo: string, mac = isMac()): string {
  return combo
    .split('+')
    .map((p) => {
      const k = p.toLowerCase()
      if (k === 'mod') return mac ? '⌘' : 'Ctrl'
      if (k === 'enter') return mac ? '↩' : 'Enter'
      if (k === 'shift') return mac ? '⇧' : 'Shift'
      if (k === 'alt') return mac ? '⌥' : 'Alt'
      return p.length === 1 ? p.toUpperCase() : p
    })
    .join(mac ? '' : '+')
}

const ACTION_LABEL: Record<string, keyof InboxLabels> = {
  next: 'scNext',
  prev: 'scPrev',
  archive: 'scArchive',
  reply: 'scReply',
  replyAll: 'scReplyAll',
  delete: 'scDelete',
  compose: 'scCompose',
  search: 'scSearch',
  send: 'scSend',
  help: 'scHelp',
}

/** Cheat-sheet list; render it in your own popover/dialog. */
export function ShortcutsHelp({ keymap, labels: o, className }: { keymap?: Partial<Keymap>; labels?: Partial<InboxLabels>; className?: string }) {
  const { labels } = useInboxLabels(o)
  const merged = { ...DEFAULT_KEYMAP, ...keymap } as Keymap
  return (
    <dl aria-label={labels.shortcuts} className={cx('grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm', className)}>
      {Object.entries(merged)
        .filter(([action, combo]) => combo && ACTION_LABEL[action])
        .map(([action, combo]) => (
          <div key={action} className="contents">
            <dt className="text-muted-foreground">{labels[ACTION_LABEL[action]!]}</dt>
            <dd className="justify-self-end">
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{formatCombo(combo)}</kbd>
            </dd>
          </div>
        ))}
    </dl>
  )
}
