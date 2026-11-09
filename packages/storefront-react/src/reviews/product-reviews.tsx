import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isStorefrontError, type ProductReview, type ReviewEligibility, type ReviewList, type ReviewListParams } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import type { ReviewsApi } from './api.js'
import { fillReviewsText, reviewsMessages, type ReviewsMessages } from './messages.js'
import { distributionPercent, REVIEW_LIMITS, validateReviewInput } from './model.js'
import { ReviewStars, StarInput } from './stars.js'

export type ProductReviewsClassNames = Partial<
  Record<'root' | 'summary' | 'average' | 'distribution' | 'toolbar' | 'list' | 'item' | 'reply' | 'more' | 'write' | 'form' | 'gate' | 'success' | 'policy', string>
>

export type ProductReviewsProps = {
  /** Handle of the product (its reviews and the purchase check are by handle). */
  handle: string
  api: ReviewsApi
  /** What the server rendered (SSR): shown at once, no loading flash. Also feeds the structured data of the page. */
  initial?: ReviewList | null
  /** Market code (`mx`, `us`) the list and summary are for; sent with every list call and with a new review. */
  market?: string
  locale?: string
  messages?: Partial<ReviewsMessages>
  /** Where «Iniciar sesión» goes (shown when the shopper is not signed in). */
  signInHref?: string
  /** Page of «Cómo funcionan nuestras reseñas» (a link under the form and next to the title); or pass `policy` inline. */
  policyHref?: string
  /** Rendered inside the section (e.g. `<ReviewsPolicy />`), after the list. */
  policy?: ReactNode
  /** Page size (default 10). */
  pageSize?: number
  /** Called after a review was accepted for moderation. */
  onSubmitted?: (result: { id: string }) => void
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4
  className?: string
  classNames?: ProductReviewsClassNames
}

const cx = (...parts: Array<string | undefined | false>): string | undefined => parts.filter(Boolean).join(' ') || undefined
const STAR_KEYS = ['5', '4', '3', '2', '1'] as const

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d)
}

type Gate = { kind: 'idle' } | { kind: 'checking' } | { kind: 'form' } | { kind: 'blocked'; eligibility: ReviewEligibility } | { kind: 'error' } | { kind: 'sent' }

/**
 * Reviews of a product: rating summary with distribution, the list («Más reseñas», rating filter, sort) and, for a
 * verified buyer, the form. Every review looks the same (no per-review badges). The write button asks the server
 * whether this shopper can review (sign in / buy first / already reviewed) and says so; nothing is shown as published
 * until the store approves it. Server-renderable: with `initial` the first paint needs no request.
 */
export function ProductReviews(props: ProductReviewsProps) {
  const { handle, api, market, signInHref, policyHref, policy, pageSize = 10, onSubmitted, headingLevel = 2, classNames = {} } = props
  const locale = useResolvedLocale(props.locale)
  const m = reviewsMessages(locale, props.messages)
  const uid = useId()
  const [list, setList] = useState<ReviewList | null>(props.initial ?? null)
  const [loaded, setLoaded] = useState(props.initial !== undefined)
  const [rating, setRating] = useState<number | null>(null)
  const [sort, setSort] = useState<NonNullable<ReviewListParams['sort']>>('recent')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [gate, setGate] = useState<Gate>({ kind: 'idle' })
  const writeRef = useRef<HTMLButtonElement>(null)
  const filterTouched = useRef(false)

  const query = useCallback(
    (extra: ReviewListParams = {}): ReviewListParams => ({ first: pageSize, ...(market ? { market } : {}), ...(rating ? { rating: rating as 1 | 2 | 3 | 4 | 5 } : {}), ...(sort !== 'recent' ? { sort } : {}), ...extra }),
    [pageSize, market, rating, sort],
  )

  const fetchFirst = useCallback(async () => {
    setBusy(true)
    setLoadError(false)
    try {
      const next = await api.list(handle, query())
      setList(next)
    } catch {
      setLoadError(true)
    } finally {
      setBusy(false)
      setLoaded(true)
    }
  }, [api, handle, query])

  // Load on mount only when the server did not provide the first page; reload when the filter or the sort changes.
  useEffect(() => {
    if (!loaded || filterTouched.current) void fetchFirst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating, sort])

  const loadMore = async () => {
    if (!list?.page_info.end_cursor || busy) return
    setBusy(true)
    setLoadError(false)
    try {
      const next = await api.list(handle, query({ after: list.page_info.end_cursor }))
      if (next) setList({ ...next, nodes: [...list.nodes, ...next.nodes] })
    } catch {
      setLoadError(true)
    } finally {
      setBusy(false)
    }
  }

  const openWrite = async () => {
    setGate({ kind: 'checking' })
    try {
      const e = await api.eligibility(handle)
      setGate(e.can_review ? { kind: 'form' } : { kind: 'blocked', eligibility: e })
    } catch {
      setGate({ kind: 'error' })
    }
  }

  const summary = list?.summary
  const count = summary?.count ?? 0
  const Heading = `h${headingLevel}` as 'h2'
  const countText = fillReviewsText(count === 1 ? m['reviews.count.one'] : m['reviews.count.other'], { count })
  const pct = summary ? distributionPercent(summary) : null
  const titleId = `${uid}-title`

  return (
    <section data-sf-reviews="" aria-labelledby={titleId} className={cx(props.className, classNames.root)}>
      <Heading id={titleId} data-sf-reviews-title="">
        {m['reviews.title']}
      </Heading>

      {count > 0 && summary && pct ? (
        <div data-sf-reviews-summary="" className={classNames.summary}>
          <div data-sf-reviews-average="" className={classNames.average}>
            <p data-sf-reviews-average-value="">
              <span aria-hidden="true">{summary.average.toFixed(1)}</span>
              <span data-sf-visually-hidden="">{fillReviewsText(m['reviews.average'], { value: summary.average.toFixed(1) })}</span>
            </p>
            <ReviewStars value={summary.average} label={fillReviewsText(m['reviews.stars'], { value: summary.average.toFixed(1) })} />
            <p data-sf-reviews-count="">{countText}</p>
          </div>
          <ul data-sf-reviews-distribution="" aria-label={m['reviews.distribution']} className={classNames.distribution}>
            {STAR_KEYS.map((k) => (
              <li key={k} aria-label={fillReviewsText(m['reviews.distribution.row'], { stars: k, count: summary.distribution[k] })}>
                <span aria-hidden="true">{k}</span>
                <span data-sf-reviews-bar="" aria-hidden="true">
                  <span style={{ inlineSize: `${pct[k]}%` }} />
                </span>
                <span aria-hidden="true" data-sf-reviews-n="">
                  {summary.distribution[k]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-sf-reviews-actions="">
        {gate.kind !== 'form' && gate.kind !== 'sent' ? (
          <button ref={writeRef} type="button" data-sf-reviews-write="" className={classNames.write} onClick={() => void openWrite()} disabled={gate.kind === 'checking'} aria-describedby={gate.kind === 'blocked' || gate.kind === 'error' ? `${uid}-gate` : undefined}>
            {gate.kind === 'checking' ? m['reviews.checking'] : m['reviews.write']}
          </button>
        ) : null}
        {policyHref ? (
          <a href={policyHref} data-sf-reviews-policy-link="">
            {m['reviews.policy']}
          </a>
        ) : null}
      </div>

      <div aria-live="polite" data-sf-reviews-live="">
        {gate.kind === 'blocked' ? (
          <div id={`${uid}-gate`} data-sf-reviews-gate={gate.eligibility.reason} className={classNames.gate}>
            <p>{gateMessage(gate.eligibility, m)}</p>
            {gate.eligibility.reason === 'login_required' && signInHref ? (
              <a href={signInHref} data-sf-reviews-signin="">
                {m['reviews.gate.login.cta']}
              </a>
            ) : null}
          </div>
        ) : null}
        {gate.kind === 'error' ? (
          <p id={`${uid}-gate`} role="alert" data-sf-reviews-gate="error" className={classNames.gate}>
            {m['reviews.gate.error']}
          </p>
        ) : null}
        {gate.kind === 'sent' ? (
          <div data-sf-reviews-success="" className={classNames.success}>
            <p>
              <strong>{m['reviews.success']}</strong>
            </p>
            <p>{m['reviews.success.detail']}</p>
          </div>
        ) : null}
      </div>

      {gate.kind === 'form' ? (
        <ReviewForm
          handle={handle}
          api={api}
          market={market}
          locale={locale}
          m={m}
          policyHref={policyHref}
          className={classNames.form}
          onCancel={() => {
            setGate({ kind: 'idle' })
            queueMicrotask(() => writeRef.current?.focus())
          }}
          onSent={(r) => {
            setGate({ kind: 'sent' })
            onSubmitted?.(r)
          }}
        />
      ) : null}

      {(count > 0 || rating !== null) && (
        <div data-sf-reviews-toolbar="" className={classNames.toolbar}>
          <label>
            <span>{m['reviews.filter']}</span>
            <select
              value={rating ?? ''}
              onChange={(e) => {
                filterTouched.current = true
                setRating(e.target.value ? Number(e.target.value) : null)
              }}
            >
              <option value="">{m['reviews.filter.all']}</option>
              {STAR_KEYS.map((k) => (
                <option key={k} value={k}>
                  {fillReviewsText(m['reviews.filter.n'], { stars: k })}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{m['reviews.sort']}</span>
            <select
              value={sort}
              onChange={(e) => {
                filterTouched.current = true
                setSort(e.target.value as typeof sort)
              }}
            >
              <option value="recent">{m['reviews.sort.recent']}</option>
              <option value="highest">{m['reviews.sort.highest']}</option>
              <option value="lowest">{m['reviews.sort.lowest']}</option>
            </select>
          </label>
        </div>
      )}

      {list && list.nodes.length > 0 ? (
        <ul data-sf-reviews-list="" className={classNames.list} aria-busy={busy || undefined}>
          {list.nodes.map((r) => (
            <ReviewItem key={r.id} review={r} locale={locale} m={m} className={classNames.item} replyClassName={classNames.reply} />
          ))}
        </ul>
      ) : loaded && !busy && !loadError ? (
        <p data-sf-reviews-empty="">{rating ? m['reviews.emptyFiltered'] : m['reviews.empty']}</p>
      ) : null}

      {loadError ? (
        <p role="alert" data-sf-reviews-error="">
          {m['reviews.loadError']}{' '}
          <button type="button" onClick={() => void (list?.page_info.has_next_page ? loadMore() : fetchFirst())}>
            {m['reviews.retry']}
          </button>
        </p>
      ) : null}

      {list?.page_info.has_next_page ? (
        <button type="button" data-sf-reviews-more="" className={classNames.more} onClick={() => void loadMore()} disabled={busy}>
          {busy ? m['reviews.loading'] : m['reviews.more']}
        </button>
      ) : null}

      {policy ? (
        <div data-sf-reviews-policy="" className={classNames.policy}>
          {policy}
        </div>
      ) : null}
    </section>
  )
}

function gateMessage(e: ReviewEligibility, m: ReviewsMessages): string {
  switch (e.reason) {
    case 'login_required':
      return m['reviews.gate.login']
    case 'not_purchased':
      return m['reviews.gate.notPurchased']
    case 'already_reviewed': {
      const st = e.mine?.status
      const detail = st === 'pending' ? m['reviews.gate.already.pending'] : st === 'approved' ? m['reviews.gate.already.approved'] : st === 'rejected' ? m['reviews.gate.already.rejected'] : ''
      return detail ? `${m['reviews.gate.already']} ${detail}` : m['reviews.gate.already']
    }
    default:
      return m['reviews.gate.error']
  }
}

function ReviewItem({ review, locale, m, className, replyClassName }: { review: ProductReview; locale: string; m: ReviewsMessages; className?: string; replyClassName?: string }) {
  const date = formatDate(review.created_at, locale)
  return (
    <li data-sf-review="" className={className}>
      <ReviewStars value={review.rating} label={fillReviewsText(m['reviews.stars'], { value: review.rating })} />
      {review.title ? <p data-sf-review-title="">{review.title}</p> : null}
      <p data-sf-review-body="">{review.body}</p>
      <p data-sf-review-meta="">
        <span data-sf-review-author="">{review.display_name}</span>
        {date ? (
          <>
            {' · '}
            <time dateTime={review.created_at}>{date}</time>
          </>
        ) : null}
      </p>
      {review.brand_reply ? (
        <div data-sf-review-reply="" className={replyClassName}>
          <p data-sf-review-reply-title="">{m['reviews.reply']}</p>
          <p>{review.brand_reply.body}</p>
        </div>
      ) : null}
    </li>
  )
}

type FieldErrors = Partial<Record<'rating' | 'title' | 'body' | 'form', string>>

function ReviewForm({ handle, api, market, locale, m, policyHref, className, onCancel, onSent }: { handle: string; api: ReviewsApi; market?: string; locale: string; m: ReviewsMessages; policyHref?: string; className?: string; onCancel: () => void; onSent: (r: { id: string }) => void }) {
  const uid = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [sending, setSending] = useState(false)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (sending) return
    const problems = validateReviewInput({ rating, title, body })
    if (problems.length) {
      const next: FieldErrors = {}
      for (const p of problems) next[p.field] = m[`reviews.error.${p.key}` as 'reviews.error.rating']
      setErrors(next)
      document.getElementById(`${uid}-${problems[0]!.field}`)?.focus()
      return
    }
    setErrors({})
    setSending(true)
    try {
      const res = await api.create(handle, {
        rating,
        title: title.trim(),
        body: body.trim(),
        ...(name.trim() ? { display_name: name.trim() } : {}),
        ...(market ? { market } : {}),
        locale: /^en\b/i.test(locale) ? 'en' : 'es',
        ...(website ? { website } : {}),
      })
      onSent({ id: res.id })
    } catch (err) {
      setErrors(serverErrors(err, m))
      setSending(false)
    }
  }

  const err = (k: keyof FieldErrors) => (errors[k] ? `${uid}-${k}-err` : undefined)
  return (
    <form data-sf-reviews-form="" className={className} onSubmit={(e) => void submit(e)} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} ref={headingRef} tabIndex={-1}>
        {m['reviews.form.title']}
      </h3>

      <div data-sf-field="">
        <span id={`${uid}-rating-l`}>{m['reviews.form.rating']}</span>
        <StarInput value={rating} onChange={setRating} label={m['reviews.form.rating']} describedBy={[`${uid}-rating-h`, err('rating')].filter(Boolean).join(' ')} starLabel={(n) => fillReviewsText(m['reviews.form.star'], { value: n })} invalid={!!errors.rating} />
        <small id={`${uid}-rating-h`}>{m['reviews.form.rating.hint']}</small>
        {errors.rating ? (
          <p id={`${uid}-rating-err`} role="alert" data-sf-reviews-field-error="">
            {errors.rating}
          </p>
        ) : null}
      </div>

      <div data-sf-field="">
        <label htmlFor={`${uid}-title`}>{m['reviews.form.headline']}</label>
        <input id={`${uid}-title`} type="text" value={title} maxLength={REVIEW_LIMITS.title.max} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title || undefined} aria-describedby={[`${uid}-title-h`, err('title')].filter(Boolean).join(' ')} autoComplete="off" />
        <small id={`${uid}-title-h`}>{m['reviews.form.headline.hint']}</small>
        {errors.title ? (
          <p id={`${uid}-title-err`} role="alert" data-sf-reviews-field-error="">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div data-sf-field="">
        <label htmlFor={`${uid}-body`}>{m['reviews.form.body']}</label>
        <textarea id={`${uid}-body`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body || undefined} aria-describedby={[`${uid}-body-h`, err('body')].filter(Boolean).join(' ')} />
        <small id={`${uid}-body-h`}>
          {m['reviews.form.body.hint']} <span data-sf-reviews-chars="">{fillReviewsText(m['reviews.form.chars'], { count: [...body].length, max: REVIEW_LIMITS.body.max })}</span>
        </small>
        {errors.body ? (
          <p id={`${uid}-body-err`} role="alert" data-sf-reviews-field-error="">
            {errors.body}
          </p>
        ) : null}
      </div>

      <div data-sf-field="">
        <label htmlFor={`${uid}-name`}>{m['reviews.form.name']}</label>
        <input id={`${uid}-name`} type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-describedby={`${uid}-name-h`} autoComplete="given-name" />
        <small id={`${uid}-name-h`}>{fillReviewsText(m['reviews.form.name.hint'], { example: m['reviews.form.name.example'] })}</small>
      </div>

      {/* Honeypot: invisible to people and to assistive tech, off the tab order; a bot that fills it is ignored. */}
      <div data-sf-reviews-hp="" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <p data-sf-reviews-legal="">
        {m['reviews.form.legal']}{' '}
        {policyHref ? (
          <a href={policyHref}>{m['reviews.policy']}</a>
        ) : null}
      </p>

      {errors.form ? (
        <p role="alert" data-sf-reviews-form-error="">
          {errors.form}
        </p>
      ) : null}

      <div data-sf-reviews-form-actions="">
        <button type="submit" data-sf-reviews-submit="" disabled={sending}>
          {sending ? m['reviews.form.sending'] : m['reviews.form.submit']}
        </button>
        <button type="button" data-sf-reviews-cancel="" onClick={onCancel} disabled={sending}>
          {m['reviews.form.cancel']}
        </button>
      </div>
    </form>
  )
}

function serverErrors(err: unknown, m: ReviewsMessages): FieldErrors {
  if (!isStorefrontError(err)) return { form: m['reviews.error.generic'] }
  if (err.status === 422 || err.status === 400) {
    const field = err.field === 'rating' || err.field === 'title' || err.field === 'body' ? err.field : null
    const reason = /links_not_allowed|personal_data|length/.exec(err.message)?.[0]
    const text = reason === 'links_not_allowed' || reason === 'personal_data' ? m[`reviews.error.${reason}` as 'reviews.error.personal_data'] : field === 'rating' ? m['reviews.error.rating'] : field ? m[`reviews.error.${field}.length` as 'reviews.error.body.length'] : m['reviews.error.field']
    return field ? { [field]: text } : { form: text }
  }
  switch (err.code) {
    case 'not_purchased':
      return { form: m['reviews.error.notPurchased'] }
    case 'login_required':
    case 'unauthorized':
      return { form: m['reviews.error.login'] }
    case 'already_reviewed':
      return { form: m['reviews.error.already'] }
    case 'rate_limited':
      return { form: err.retryAfter ? fillReviewsText(m['reviews.error.limit.after'], { minutes: Math.max(1, Math.ceil(err.retryAfter / 60)) }) : m['reviews.error.limit'] }
  }
  return { form: err.status === 429 ? m['reviews.error.limit'] : m['reviews.error.generic'] }
}

/** «Cómo funcionan nuestras reseñas»: the plain rules, true to what the system enforces. Texts are overridable. */
export function ReviewsPolicy({ locale, messages, className, headingLevel = 2 }: { locale?: string; messages?: Partial<ReviewsMessages>; className?: string; headingLevel?: 2 | 3 | 4 }) {
  const loc = useResolvedLocale(locale)
  const m = reviewsMessages(loc, messages)
  const id = useId()
  const Heading = `h${headingLevel}` as 'h2'
  return (
    <section data-sf-reviews-rules="" aria-labelledby={id} className={className}>
      <Heading id={id}>{m['reviews.policy.title']}</Heading>
      <ul>
        {(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const).map((k) => (
          <li key={k}>{m[`reviews.policy.${k}`]}</li>
        ))}
      </ul>
    </section>
  )
}
