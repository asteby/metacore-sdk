/**
 * Server side of «My items» (`@asteby/storefront-react/subjects/server`): the guest's cookie, the cache rule, the loader
 * (`loadSubjectsContext`, never throws) and the action (`createSubjectAction`). No React, no router: Web `Request` /
 * `Response` only, so any framework mounts it. The browser never talks to OPS.
 *
 * Privacy: the cookie holds ONLY the compatibility key (`fit_key`), and `serializeSubjectCookie` refuses a key that does
 * not resolve against the kind's catalog, so a licence plate or any private value can never be written to it. Nothing in
 * this file logs a value, and a private value is never echoed back (`SubjectActionData.values` carries public ones only).
 */
import {
  isStorefrontError,
  type StorefrontClient,
  type Subject,
  type SubjectInput,
  type SubjectKind,
  type SubjectPatch,
  type SubjectProblemCode,
} from '@asteby/storefront'
import { subjectFromFitKey } from './fit-key.js'
import type { SubjectActionData, SubjectErrorCode, SubjectIntent } from './types.js'

export type { SubjectActionData, SubjectErrorCode, SubjectIntent } from './types.js'
export { subjectFromFitKey } from './fit-key.js'

// ---- the guest's cookie ------------------------------------------------------------------------------------------------

export const SUBJECT_COOKIE_PREFIX = 'sf_subject_'
const KIND_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

/** Cookie name of a kind: `sf_subject_<kind>`. */
export function subjectCookieName(kind: Pick<SubjectKind, 'key'> | string): string {
  const key = typeof kind === 'string' ? kind : kind.key
  if (!KIND_KEY_RE.test(key)) throw new TypeError('subjectCookieName: not a kind key')
  return SUBJECT_COOKIE_PREFIX + key
}

/** The key the guest chose, validated against the kind's catalog; `null` when absent, tampered or stale. */
export function readSubjectFitKey(cookieHeader: string | null | undefined, kind: SubjectKind): string | null {
  if (!cookieHeader) return null
  const name = subjectCookieName(kind)
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue
    let raw = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    try {
      raw = decodeURIComponent(raw)
    } catch {
      return null
    }
    return subjectFromFitKey(kind, raw) ? raw : null
  }
  return null
}

export type SubjectCookieOptions = {
  /** Lifetime in days (default 365). */
  maxAgeDays?: number
  path?: string
  domain?: string
  sameSite?: 'Lax' | 'Strict' | 'None'
  /** Defaults to true when `sameSite` is `None`; set it on https. */
  secure?: boolean
}

/**
 * `Set-Cookie` value that remembers the guest's item: `HttpOnly`, `SameSite=Lax`, one year. Pass `null` to clear it.
 * It throws `TypeError` for a key that does not resolve against the kind: only a real `fit_key` can reach the cookie.
 */
export function serializeSubjectCookie(kind: SubjectKind, fitKey: string | null, options: SubjectCookieOptions = {}): string {
  if (fitKey !== null && !subjectFromFitKey(kind, fitKey)) throw new TypeError('serializeSubjectCookie: not a compatibility key of this kind')
  const parts = [`${subjectCookieName(kind)}=${fitKey ? encodeURIComponent(fitKey) : ''}`, `Path=${options.path ?? '/'}`]
  parts.push(`Max-Age=${fitKey ? Math.round((options.maxAgeDays ?? 365) * 86_400) : 0}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  const sameSite = options.sameSite ?? 'Lax'
  parts.push(`SameSite=${sameSite}`, 'HttpOnly')
  if (options.secure ?? sameSite === 'None') parts.push('Secure')
  return parts.join('; ')
}

// ---- cache --------------------------------------------------------------------------------------------------------------

/** Is there a remembered item (of any kind) in the request? Then the page depends on the buyer. */
export function hasActiveSubject(cookieHeader: string | null | undefined): boolean {
  return !!cookieHeader && cookieHeader.split(';').some((p) => p.trim().startsWith(SUBJECT_COOKIE_PREFIX) && p.indexOf('=') > 0 && !/=\s*$/.test(p))
}

/**
 * Cache headers of a page that changes with the buyer's item: with one remembered it is the buyer's (`private`, varying on
 * the cookie); without, the store's public policy applies. Pass the store's own `Cache-Control` for the public case.
 */
export function subjectCacheHeaders(cookieHeader: string | null | undefined, publicCacheControl: string, opts: { signedIn?: boolean } = {}): Record<string, string> {
  if (opts.signedIn || hasActiveSubject(cookieHeader)) return { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
  return { 'Cache-Control': publicCacheControl }
}

// ---- loader -------------------------------------------------------------------------------------------------------------

export type ActiveSubject = {
  kind: string
  label: string
  fit_key: string
  /** `account`: the buyer's active saved item; `cookie`: what the guest remembered. */
  source: 'account' | 'cookie'
  /** The saved item (`account` only). */
  subject?: Subject
}

export type SubjectsContext = {
  kinds: SubjectKind[]
  /** The buyer's saved items (empty for a guest or when they could not be read). */
  subjects: Subject[]
  /** Per kind key: the item that applies (the buyer's active one, else the guest's cookie). */
  active: Record<string, ActiveSubject>
  /** Something could not be read (the rest is still true): show «We could not load this · Try again» for that part. */
  degraded: { kinds: boolean; subjects: boolean }
}

/** What is assumed when nothing can be asked: no kinds, so the section simply does not exist. */
export const NO_SUBJECTS: Readonly<SubjectsContext> = Object.freeze({ kinds: [], subjects: [], active: {}, degraded: { kinds: true, subjects: false } })

export type LoadSubjectsContextOptions = {
  /** The buyer-scoped client (`withCustomerToken`); omit for a guest. */
  customer?: StorefrontClient | null
  cookieHeader?: string | null
  signal?: AbortSignal
}

/**
 * The kinds the store declares, the buyer's saved items and the one that applies to each kind. It NEVER throws: an
 * organization that declares nothing (or a server that predates it) gives `kinds: []` and the section does not exist; a
 * failure reading the items keeps the kinds and flags `degraded.subjects`. Use it as the loader of any page that
 * lists parts or the buyer's garage.
 */
export async function loadSubjectsContext(sf: StorefrontClient, options: LoadSubjectsContextOptions = {}): Promise<SubjectsContext> {
  const opt = options.signal ? { signal: options.signal } : undefined
  let kinds: SubjectKind[]
  try {
    kinds = await sf.content.subjectKinds(opt)
  } catch {
    return NO_SUBJECTS
  }
  if (kinds.length === 0) return { kinds: [], subjects: [], active: {}, degraded: { kinds: false, subjects: false } }
  let subjects: Subject[] = []
  let degraded = false
  if (options.customer) {
    try {
      subjects = await options.customer.customer.subjects.list(undefined, opt)
    } catch {
      degraded = true
    }
  }
  const active: Record<string, ActiveSubject> = {}
  for (const kind of kinds) {
    const mine = subjects.filter((s) => s.kind === kind.key)
    const chosen = mine.find((s) => s.is_default) ?? mine[0]
    if (chosen) {
      active[kind.key] = { kind: kind.key, label: chosen.label, fit_key: chosen.fit_key, source: 'account', subject: chosen }
      continue
    }
    const key = readSubjectFitKey(options.cookieHeader, kind)
    const guest = key ? subjectFromFitKey(kind, key) : null
    if (key && guest) active[kind.key] = { kind: kind.key, label: guest.label, fit_key: key, source: 'cookie' }
  }
  return { kinds, subjects, active, degraded: { kinds: false, subjects: degraded } }
}

// ---- action -------------------------------------------------------------------------------------------------------------

export type ParsedSubjectForm = {
  intent: SubjectIntent | null
  id: string
  kind: string
  /** Public and private values typed (empty ones left out; a private one flagged to clear is `null`). */
  attributes: Record<string, string | null>
  /** Public values only, to refill the form. */
  echo: Record<string, string>
  nickname: string | null | undefined
  isDefault: boolean
}

const text = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Reads the form the components post: `intent`, `id`, `kind`, `<prefix>.<field>` for each field (`<prefix>.<field>.clear`
 * to remove a stored private value), `nickname`, `is_default`. `privateKeys` are the kind's private fields: they are never
 * part of `echo`.
 */
export function parseSubjectForm(form: FormData, privateKeys: readonly string[] = [], prefix = 'subject'): ParsedSubjectForm {
  const attributes: Record<string, string | null> = {}
  const echo: Record<string, string> = {}
  const head = `${prefix}.`
  for (const [name, value] of form.entries()) {
    if (!name.startsWith(head) || name.endsWith('.clear')) continue
    const key = name.slice(head.length)
    const v = text(value)
    if (v) {
      attributes[key] = v
      if (!privateKeys.includes(key)) echo[key] = v
    }
  }
  for (const key of privateKeys) if (form.get(`${head}${key}.clear`)) attributes[key] = null
  const intent = text(form.get('intent'))
  const nick = form.has('nickname') ? text(form.get('nickname')) : undefined
  return {
    intent: intent === 'subject-save' || intent === 'subject-delete' || intent === 'subject-default' || intent === 'subject-refine' ? intent : null,
    id: text(form.get('id')),
    kind: text(form.get('kind')),
    attributes,
    echo,
    nickname: nick === undefined ? undefined : nick || null,
    isDefault: !!form.get('is_default'),
  }
}

const fail = (intent: SubjectIntent | undefined, code: SubjectErrorCode, extra: Partial<SubjectActionData> = {}): SubjectActionData => ({
  ok: false,
  ...(intent ? { intent } : {}),
  ...extra,
  error: { code, ...(extra.error?.field ? { field: extra.error.field } : {}) },
})

/** `attributes.make` → `make`. */
const fieldOf = (field: string | undefined): string | undefined => (field ? field.replace(/^attributes\./, '') : undefined)

/**
 * Why a field was refused, from the server's message. The real server writes «attributes.make: is not in the catalog»;
 * the mock writes «make: not_in_catalog». Both map to one code; the value is never part of either message.
 */
function problemOf(message: string | undefined): SubjectProblemCode | 'invalid' {
  const m = (message ?? '').toLowerCase()
  const coded = /:\s*(required|unknown|invalid|not_in_catalog|year_range|catalog_unavailable)\b/.exec(m)?.[1]
  if (coded) return coded as SubjectProblemCode
  if (/:\s*required\b/.test(m)) return 'required'
  if (m.includes('unknown field')) return 'unknown'
  if (m.includes('not in the catalog')) return 'not_in_catalog'
  if (m.includes('outside the years')) return 'year_range'
  if (m.includes('catalog is not available')) return 'catalog_unavailable'
  return 'invalid'
}

function toFailure(err: unknown, intent: SubjectIntent, values: Record<string, string>, id?: string): SubjectActionData {
  const carry = { values, ...(id ? { id } : {}) }
  if (!isStorefrontError(err)) return fail(intent, 'unavailable', carry)
  if (err.code === 'insufficient_scope') return fail(intent, 'store_misconfigured', carry)
  switch (err.status) {
    case 401:
      return fail(intent, 'unauthorized', carry)
    case 404:
      return fail(intent, 'not_found', carry)
    case 409:
      return fail(intent, err.field === 'kind' ? 'limit' : 'duplicate', carry)
    case 429:
      return fail(intent, 'rate_limited', carry)
    case 403:
      return fail(intent, 'unsupported', carry)
    case 400:
    case 422: {
      const field = fieldOf(err.field)
      const why = problemOf(err.message)
      return fail(intent, err.field === 'kind' ? 'unsupported' : 'validation', {
        ...carry,
        ...(field ? { fieldErrors: { [field]: why }, error: { code: 'validation', field } } : {}),
      })
    }
    default:
      return fail(intent, 'unavailable', carry)
  }
}

function sameSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
    return new URL(origin).host === host.split(',')[0]!.trim()
  } catch {
    return false
  }
}

export type CreateSubjectActionOptions = {
  storefront: StorefrontClient
  /** The buyer's session token from the store's own cookie (`readCustomerToken`) or a cookie object with `parse`. */
  readCustomerToken?: (request: Request) => string | null | undefined | Promise<string | null | undefined>
  customerCookie?: { parse(header: string | null): unknown | Promise<unknown> }
  clientIp?: (request: Request) => string | null | undefined
  /** Field-name prefix of the form (default `subject`). */
  namePrefix?: string
  /** Refuse a cross-site POST (default true). */
  sameSiteOnly?: boolean
}

/**
 * The action of the «My items» forms: one `POST` with an `intent` field.
 *
 * | intent            | fields                                                       | does                                          |
 * | ----------------- | ------------------------------------------------------------ | --------------------------------------------- |
 * | `subject-save`    | kind, `subject.<field>`…, nickname?, is_default?, id? (edit) | creates, or updates when `id` is set          |
 * | `subject-delete`  | id                                                           | `customer.subjects.delete` (physical)         |
 * | `subject-default` | id                                                           | makes it the active item of its kind          |
 * | `subject-refine`  | `subject.<field>`…                                           | saves nothing: echoes the values (no-JS cascade) |
 *
 * It never redirects: it returns a `SubjectActionData` for the page to render, with 422s mapped to the field
 * (`fieldErrors.make`). An empty private field on edit keeps the stored value; `subject.<field>.clear` removes it.
 * Nothing is logged and no private value is echoed.
 */
export function createSubjectAction(options: CreateSubjectActionOptions) {
  const { storefront: sf } = options
  const prefix = options.namePrefix ?? 'subject'
  async function token(request: Request): Promise<string | null> {
    if (options.readCustomerToken) return (await options.readCustomerToken(request)) || null
    if (!options.customerCookie) return null
    const v = await options.customerCookie.parse(request.headers.get('cookie'))
    return typeof v === 'string' && v ? v : null
  }
  return async function subjectAction({ request }: { request: Request }): Promise<SubjectActionData> {
    if (options.sameSiteOnly !== false && !sameSite(request)) return fail(undefined, 'unsupported')
    const form = await request.formData().catch(() => null)
    if (!form) return fail(undefined, 'validation')
    const tok = await token(request)
    const ip = options.clientIp?.(request)
    const w = { ...(ip ? { clientIp: ip } : {}), ...(tok ? { customerToken: tok } : {}) }
    // The kind is known to the store, not trusted from the form: which fields are private comes from the data.
    const rawKind = text(form.get('kind'))
    let privateKeys: string[] = []
    try {
      const kinds = await sf.content.subjectKinds()
      privateKeys = kinds.find((k) => k.key === rawKind)?.fields.filter((f) => f.private).map((f) => f.key) ?? []
    } catch {
      /* the write below answers for itself */
    }
    const p = parseSubjectForm(form, privateKeys, prefix)
    const intent = p.intent
    if (!intent) return fail(undefined, 'validation')
    // Without JavaScript the cascade advances by posting: nothing is saved, the form is drawn again with these values.
    if (intent === 'subject-refine') return { ok: false, intent, values: p.echo, ...(p.id ? { id: p.id } : {}) }
    if (!tok) return fail(intent, 'unauthorized', { values: p.echo, ...(p.id ? { id: p.id } : {}) })
    try {
      switch (intent) {
        case 'subject-save': {
          if (!p.kind && !p.id) return fail(intent, 'validation', { values: p.echo })
          const saved = p.id
            ? await sf.customer.subjects.update(p.id, { attributes: p.attributes, ...(p.nickname !== undefined ? { nickname: p.nickname } : {}), ...(p.isDefault ? { is_default: true } : {}) } satisfies SubjectPatch, w)
            : await sf.customer.subjects.create({ kind: p.kind, attributes: p.attributes, ...(p.nickname !== undefined ? { nickname: p.nickname } : {}), ...(p.isDefault ? { is_default: true } : {}) } satisfies SubjectInput, w)
          return { ok: true, intent, subject: saved }
        }
        case 'subject-delete': {
          if (!p.id) return fail(intent, 'validation')
          await sf.customer.subjects.delete(p.id, w)
          return { ok: true, intent }
        }
        case 'subject-default': {
          if (!p.id) return fail(intent, 'validation')
          return { ok: true, intent, subject: await sf.customer.subjects.update(p.id, { is_default: true }, w) }
        }
      }
    } catch (err) {
      // Never log the error: a message can carry the field, and the request holds the buyer's items.
      return toFailure(err, intent, p.echo, p.id)
    }
  }
}

export type SubjectAction = ReturnType<typeof createSubjectAction>
