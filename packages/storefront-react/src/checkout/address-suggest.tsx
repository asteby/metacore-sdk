/**
 * Street-and-number type-ahead of `AddressFields`: an accessible ARIA combobox (WAI-ARIA 1.2 "list autocomplete") over
 * the suggestions the Storefront API serves from the market's geocoding provider.
 *
 * What it promises, and tests pin:
 * - It only SUGGESTS. It never blocks a field, never changes state, city or colonia of the catalog, and never gets in
 *   the way of the payment: with no provider, a slow or a failing one the input is the plain input it always was.
 * - Nothing is asked for fewer than 3 characters, nothing before 250 ms of stillness, and nothing slower than 800 ms is
 *   waited for. A stale answer is discarded.
 * - Keyboard: ArrowDown/ArrowUp move, Enter accepts the highlighted option (and only then: otherwise the form submits as
 *   usual), Escape closes, Tab leaves. A polite live region says how many options there are and what was chosen.
 * - Attribution (© OpenStreetMap contributors, ODbL) is shown with the list.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { AddressSuggestion } from '@asteby/storefront'
import { CheckoutField, type CheckoutFieldClassNames, type FieldMessages } from './fields.js'

export type { AddressSuggestion }

/** What `suggestAddress` receives besides the text. */
export type AddressSuggestContext = {
  /** Aborted when a newer query replaces this one or after 800 ms: stop waiting. */
  signal: AbortSignal
  /** Postal code in the form right now (`''` when empty). */
  zip: string
  /** ISO country of the address. */
  country: string
  locale?: string
}

/** What `suggestAddress` answers (the body of `GET /storefront/address/suggest`). */
export type AddressSuggestResult = {
  suggestions: readonly AddressSuggestion[]
  /** `false`: no provider for the market. The field stops asking and stays plain. */
  available?: boolean
  /** `true`: a provider exists but did not answer this time. */
  degraded?: boolean
}

export type SuggestAddress = (query: string, ctx: AddressSuggestContext) => Promise<AddressSuggestResult | null | undefined>

export type AddressSuggestMessages = {
  /** Accessible name of the list. */
  suggestionsLabel: string
  /** Live region when options arrive; `{n}` is the count. */
  suggestionsCount: string
  /** Live region after choosing; `{label}` is the option. */
  suggestionChosen: string
  attribution: string
}

export const ADDRESS_SUGGEST_MIN_CHARS = 3
export const ADDRESS_SUGGEST_DEBOUNCE_MS = 250
export const ADDRESS_SUGGEST_TIMEOUT_MS = 800
/** After two failures in a row the field stops asking for this long: typing continues, the payment is untouched. */
export const ADDRESS_SUGGEST_COOLDOWN_MS = 30_000

const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const normalize = (v: string) => v.trim().replace(/\s+/g, ' ')

export type AddressLineFieldProps = {
  name: string
  label: string
  hint?: ReactNode
  error?: string | null
  defaultValue?: string
  autoComplete?: string
  suggest: SuggestAddress
  /** Called with the typed text's context at ask time. */
  getContext: () => { zip: string; country: string; locale?: string }
  /** Applies an accepted option to the form (the parent knows the other fields). */
  onChoose: (s: AddressSuggestion) => void
  /** Set when the market has no provider, so other fields of the page do not ask again. */
  onUnavailable?: () => void
  messages: AddressSuggestMessages
  /** Attribution line; `false` hides it (a provider whose data needs none). */
  attribution?: ReactNode | false
  className?: string
  classNames?: CheckoutFieldClassNames & { suggestions?: string; suggestion?: string; suggestionActive?: string; attribution?: string }
  common: { locale?: string; messages?: Partial<FieldMessages> }
  /** Test hooks. */
  debounceMs?: number
  timeoutMs?: number
  now?: () => number
}

/** The address line as a combobox. Uncontrolled like every field of `AddressFields`: the form owns the value. */
export function AddressLineField(props: AddressLineFieldProps) {
  const { name, suggest, getContext, onChoose, onUnavailable, messages: msg, classNames: cx = {}, common } = props
  const debounceMs = props.debounceMs ?? ADDRESS_SUGGEST_DEBOUNCE_MS
  const timeoutMs = props.timeoutMs ?? ADDRESS_SUGGEST_TIMEOUT_MS
  const now = props.now ?? Date.now
  const uid = useId()
  const listId = `${uid}-list`
  const optionId = (i: number) => `${uid}-opt-${i}`
  const [items, setItems] = useState<readonly AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [announce, setAnnounce] = useState('')
  const [enabled, setEnabled] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const lastAsked = useRef('')
  const failures = useRef(0)
  const pausedUntil = useRef(0)
  const suggestRef = useRef(suggest)
  suggestRef.current = suggest

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    ctl.current?.abort()
    ctl.current = null
    seq.current++
  }
  useEffect(() => cancel, [])

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  const ask = (query: string) => {
    if (now() < pausedUntil.current) return
    const mine = ++seq.current
    ctl.current?.abort()
    const controller = new AbortController()
    ctl.current = controller
    // The answer is worth waiting for only briefly: past this the form simply stays manual.
    const cut = setTimeout(() => controller.abort(), timeoutMs)
    const ctx = getContext()
    lastAsked.current = query
    let call: Promise<AddressSuggestResult | null | undefined>
    try {
      call = Promise.resolve(suggestRef.current(query, { ...ctx, signal: controller.signal }))
    } catch (e) {
      call = Promise.reject(e)
    }
    // A function that ignores the signal is still cut off at the deadline.
    const deadline = new Promise<'timeout'>((resolve) => controller.signal.addEventListener('abort', () => resolve('timeout'), { once: true }))
    void Promise.race([call, deadline]).then(
      (res) => {
        clearTimeout(cut)
        if (mine !== seq.current) return
        if (res === 'timeout' || !res || res.degraded) {
          failures.current++
          if (failures.current >= 2) pausedUntil.current = now() + ADDRESS_SUGGEST_COOLDOWN_MS
          setItems([])
          close()
          return
        }
        failures.current = 0
        if (res.available === false) {
          // No provider in this market: back to the plain input for good.
          setEnabled(false)
          setItems([])
          close()
          onUnavailable?.()
          return
        }
        const list = res.suggestions.filter((s) => !!s && typeof s.label === 'string' && s.label.trim()).slice(0, 8)
        setItems(list)
        setActive(-1)
        setOpen(list.length > 0)
        setAnnounce(list.length > 0 ? msg.suggestionsCount.replace('{n}', String(list.length)) : '')
      },
      () => {
        clearTimeout(cut)
        if (mine !== seq.current) return
        failures.current++
        if (failures.current >= 2) pausedUntil.current = now() + ADDRESS_SUGGEST_COOLDOWN_MS
        setItems([])
        close()
      },
    )
  }

  const schedule = (raw: string) => {
    const q = normalize(raw)
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if ([...q].length < ADDRESS_SUGGEST_MIN_CHARS) {
      // Too short to be an address: forget everything in flight, ask nobody.
      cancel()
      lastAsked.current = ''
      setItems([])
      setAnnounce('')
      close()
      return
    }
    if (q === lastAsked.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      ask(q)
    }, debounceMs)
  }

  const choose = (i: number) => {
    const s = items[i]
    if (!s) return
    cancel()
    lastAsked.current = ''
    close()
    setItems([])
    setAnnounce(msg.suggestionChosen.replace('{label}', s.label))
    onChoose(s)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!enabled) return
    switch (e.key) {
      case 'ArrowDown':
        if (items.length === 0) return
        e.preventDefault()
        setOpen(true)
        setActive((a) => (a + 1) % items.length)
        return
      case 'ArrowUp':
        if (items.length === 0) return
        e.preventDefault()
        setOpen(true)
        setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
        return
      case 'Enter':
        // Only an option the buyer moved to is accepted; otherwise Enter is the form's.
        if (open && active >= 0) {
          e.preventDefault()
          choose(active)
        }
        return
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          close()
        }
        return
      case 'Tab':
        close()
        return
    }
  }

  const expanded = enabled && open && items.length > 0
  const attribution = props.attribution === undefined ? msg.attribution : props.attribution
  const comboProps = enabled
    ? ({
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': expanded,
        'aria-controls': listId,
        'aria-activedescendant': expanded && active >= 0 ? optionId(active) : undefined,
        spellCheck: false,
      } as const)
    : {}

  return (
    <div className={props.className} style={{ position: 'relative' }} data-sf-address-suggest={enabled ? '' : undefined}>
      <CheckoutField
        {...common}
        name={name}
        label={props.label}
        autoComplete={props.autoComplete ?? 'address-line1'}
        defaultValue={props.defaultValue ?? ''}
        error={props.error ?? null}
        hint={props.hint}
        classNames={cx}
        {...comboProps}
        onInput={(e) => {
          // A fill the component itself dispatched (an accepted option, a postal-code lookup) is not typing.
          if ((e.nativeEvent as unknown as Record<string, unknown>).sfSynthetic === true) return
          if (enabled) schedule(e.currentTarget.value)
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {enabled ? (
        <>
          <div role="status" aria-live="polite" style={SR_ONLY} data-sf-suggest-status="">
            {announce}
          </div>
          {expanded ? (
            <div
              data-sf-suggestions=""
              className={cx.suggestions}
              style={cx.suggestions ? undefined : { position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'Canvas', color: 'CanvasText', border: '1px solid GrayText', borderRadius: 6, marginTop: 2, maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 14px rgb(0 0 0 / 0.18)' }}
            >
              <ul id={listId} role="listbox" aria-label={msg.suggestionsLabel} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((s, i) => {
                  const on = i === active
                  return (
                    <li
                      key={s.id ?? `${s.label}-${i}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      data-sf-suggestion=""
                      data-active={on ? '' : undefined}
                      className={[cx.suggestion, on ? cx.suggestionActive : undefined].filter(Boolean).join(' ') || undefined}
                      style={cx.suggestion ? undefined : { padding: '8px 10px', cursor: 'pointer', ...(on ? { background: 'Highlight', color: 'HighlightText' } : {}) }}
                      // mousedown, not click: the input must not lose focus (which would close the list first).
                      onMouseDown={(e) => {
                        e.preventDefault()
                        choose(i)
                      }}
                      onMouseMove={() => (on ? undefined : setActive(i))}
                    >
                      {s.label}
                    </li>
                  )
                })}
              </ul>
              {attribution !== false ? (
                <p className={cx.attribution} data-sf-attribution="" style={cx.attribution ? undefined : { margin: 0, padding: '4px 10px', fontSize: '0.75em', opacity: 0.75, borderTop: '1px solid GrayText' }}>
                  {typeof attribution === 'string' ? (
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                      {attribution}
                    </a>
                  ) : (
                    attribution
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
