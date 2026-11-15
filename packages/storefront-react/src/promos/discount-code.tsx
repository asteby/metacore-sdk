import { useId, useState, type ComponentType, type FormHTMLAttributes, type ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import {
  discountCodeFeedback,
  discountCodeMessage,
  normalizeDiscountCode,
  promotionMessages,
  type DiscountCodeFeedback,
  type PromotionMessages,
} from '@asteby/storefront'

type FormLike = ComponentType<FormHTMLAttributes<HTMLFormElement> & { children?: ReactNode }>

const PlainForm: FormLike = (p) => <form {...p} />

// Visually hidden, still read by screen readers (no CSS dependency).
const SR_ONLY = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 } as const

export type DiscountCodeFormProps = {
  /** `Cart.discount_codes`, as OPS returned them. The component never decides whether a code applies. */
  codes: readonly { code: string; applicable: boolean; reason?: string }[] | null | undefined
  /**
   * The form element. Default a plain `<form>` (works without JavaScript); pass React Router's `Form` (or a
   * fetcher's `Form`) to keep navigation in the app. The shop's route action handles the post.
   */
  as?: FormLike
  /** `action` of the form (default: the current route). */
  action?: string
  /** Hidden intent sent with the post. Default `name="intent" value="discount"`. */
  intent?: string
  intentName?: string
  /** Name of the code field. Default `code`; an empty value removes the codes. */
  fieldName?: string
  /** The post is in flight (`navigation.state` / `fetcher.state`): disables the buttons and shows "Aplicando…". */
  busy?: boolean
  /** An error of the shop's action that is not a code reason (network, expired cart). Shown as an alert. */
  error?: string | null
  locale?: string
  messages?: Partial<PromotionMessages>
  className?: string
  inputClassName?: string
  buttonClassName?: string
  removeButtonClassName?: string
  /** Visually hide the label (it stays for screen readers). Default false. */
  hideLabel?: boolean
}

/**
 * Discount code field of the cart (or checkout). Codes are created in the OPS panel (storefront_cart → Cupones) and
 * applied by the server: this only posts the typed code and shows what `Cart.discount_codes` says (applied, valid
 * pending shipping, or rejected with its reason). One code at a time: applying another replaces it; "Quitar" posts
 * an empty code. Accessible: real label, `aria-invalid` + `aria-describedby` on the field, status/alert regions.
 */
export function DiscountCodeForm({
  codes,
  as: FormEl,
  action,
  intent = 'discount',
  intentName = 'intent',
  fieldName = 'code',
  busy = false,
  error,
  locale: localeProp,
  messages,
  className,
  inputClassName,
  buttonClassName,
  removeButtonClassName,
  hideLabel = false,
}: DiscountCodeFormProps) {
  const locale = useResolvedLocale(localeProp)
  const m = promotionMessages(locale, messages)
  const id = useId()
  const feedback = discountCodeFeedback(codes)
  const current = feedback.find((f) => f.status !== 'rejected') ?? null
  const rejected = feedback.filter((f) => f.status === 'rejected')
  const [formatError, setFormatError] = useState(false)
  const F: FormLike = FormEl ?? PlainForm
  const invalid = formatError || rejected.length > 0 || !!error
  const describedBy = `${id}-msg`

  const hidden = <input type="hidden" name={intentName} value={intent} />
  return (
    <div className={className} data-sf-discount-code data-state={current ? current.status : rejected.length ? 'rejected' : 'idle'}>
      <F
        method="post"
        {...(action ? { action } : {})}
        noValidate
        onSubmit={(e) => {
          const input = e.currentTarget.elements.namedItem(fieldName) as HTMLInputElement | null
          const ok = normalizeDiscountCode(input?.value) !== false
          setFormatError(!ok)
          if (!ok) {
            e.preventDefault()
            input?.focus()
          }
        }}
        data-sf-discount-code-form
      >
        {hidden}
        <label htmlFor={id} {...(hideLabel ? { style: SR_ONLY } : {})}>
          {m['code.label']}
        </label>
        <div data-sf-discount-code-row>
          <input
            id={id}
            name={fieldName}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            placeholder={m['code.placeholder']}
            defaultValue={current?.code ?? ''}
            key={current?.code ?? ''}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onInput={() => formatError && setFormatError(false)}
            className={inputClassName}
          />
          <button type="submit" disabled={busy} aria-busy={busy || undefined} className={buttonClassName}>
            {busy ? m['code.applying'] : m['code.apply']}
          </button>
        </div>
      </F>
      <div id={describedBy} data-sf-discount-code-messages>
        {formatError ? (
          <p role="alert" data-sf-discount-code-status="invalid">
            {m['code.invalid_format']}
          </p>
        ) : null}
        {error ? (
          <p role="alert" data-sf-discount-code-status="error">
            {error}
          </p>
        ) : null}
        {rejected.map((f) => (
          <p key={`r-${f.code}`} role="alert" data-sf-discount-code-status="rejected" data-reason={f.reason ?? ''}>
            {discountCodeMessage(f, m)}
          </p>
        ))}
        {current ? <AppliedCode f={current} m={m} F={F} action={action} hidden={hidden} fieldName={fieldName} busy={busy} className={removeButtonClassName} /> : null}
      </div>
    </div>
  )
}

function AppliedCode({
  f,
  m,
  F,
  action,
  hidden,
  fieldName,
  busy,
  className,
}: {
  f: DiscountCodeFeedback
  m: PromotionMessages
  F: FormLike
  action: string | undefined
  hidden: ReactNode
  fieldName: string
  busy: boolean
  className: string | undefined
}) {
  return (
    <F method="post" {...(action ? { action } : {})} data-sf-discount-code-applied={f.status}>
      {hidden}
      <input type="hidden" name={fieldName} value="" />
      <p role="status" aria-live="polite" data-sf-discount-code-status={f.status}>
        {discountCodeMessage(f, m)}
      </p>
      <button type="submit" disabled={busy} className={className} aria-label={`${m['code.remove']} ${f.code}`}>
        {m['code.remove']}
      </button>
    </F>
  )
}
