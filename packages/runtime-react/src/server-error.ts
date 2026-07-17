// Shared server/network error surfacing for declarative mutations & actions.
//
// Kernel/host handlers answer a failed write with a consistent envelope:
//   { success: false, message: "<headline / i18n key>", details: "<real cause>" }
// where `details` carries what actually went wrong (a Postgres error, a
// declarative guard failure, a validation reason). The historical toast pattern
//   toast.error(err?.response?.data?.message || t('common.error'))
// threw `details` away and showed only the generic headline ("Error creating
// record") — so a user/operator saw "something failed" with no way to know WHY
// or report it. This module keeps the headline but ALSO surfaces the cause as
// the toast description, in ONE place so every call site behaves identically.
import { toast } from 'sonner'

/** Structured, display-ready view of an error: a headline + an optional cause. */
export interface ExtractedError {
    /** Primary line — the server's `message` (may be an i18n key) or a fallback. */
    title: string
    /** Secondary line — the specific cause: `details`, `error`, joined validation
     *  `errors`, or a raw network/thrown message. Undefined when nothing more
     *  specific than the title is available. */
    description?: string
}

/** Flattens a validation `errors` payload (string | string[] | field→msgs map)
 *  into a single newline-joined string, or undefined when empty. */
function joinErrors(errors: unknown): string | undefined {
    if (!errors) return undefined
    if (typeof errors === 'string') return errors || undefined
    if (Array.isArray(errors)) return errors.filter(Boolean).map(String).join('\n') || undefined
    if (typeof errors === 'object') {
        const parts = Object.entries(errors as Record<string, unknown>).map(
            ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`,
        )
        return parts.join('\n') || undefined
    }
    return undefined
}

/**
 * Pull the best available headline + cause out of an axios error, a raw
 * `{ success:false, ... }` response body, or a thrown Error/string. Pure — no
 * i18n, no toast — so it is unit-testable and reusable (dialogs, inline errors).
 *
 * Resolution:
 *   title       ← data.message (else the specific cause, so the toast is never
 *                 empty; else `fallbackTitle`)
 *   description ← data.details → data.error → joined data.errors → raw err.message
 */
export function extractServerError(err: unknown, fallbackTitle: string): ExtractedError {
    // Accept either an axios error (`err.response.data`) or a bare response body
    // (`{ success, message, details }`) passed straight in.
    const maybeAxios = (err as { response?: { data?: unknown } } | undefined)?.response?.data
    const data = maybeAxios ?? err

    if (data && typeof data === 'object' && ('message' in data || 'details' in data || 'errors' in data || 'error' in data)) {
        const d = data as { message?: unknown; details?: unknown; error?: unknown; errors?: unknown }
        const message = typeof d.message === 'string' ? d.message.trim() : ''
        const details =
            (typeof d.details === 'string' && d.details.trim()) ||
            (typeof d.error === 'string' && d.error.trim()) ||
            joinErrors(d.errors) ||
            ''
        if (message && details && message !== details) return { title: message, description: details }
        if (message || details) return { title: message || details }
    }

    // Non-HTTP failure (network down, CORS, a thrown string/Error): show it as
    // the cause under the generic fallback headline.
    const raw = typeof err === 'string' ? err : (err as { message?: unknown } | undefined)?.message
    if (typeof raw === 'string' && raw.trim()) return { title: fallbackTitle, description: raw.trim() }
    return { title: fallbackTitle }
}

/** i18n translator, tolerant of non-keys (returns `defaultValue`/the input). */
export type Translate = (key: string, opts?: { defaultValue?: string }) => string

/** A dotted, space-free token (e.g. "pos.rate.created") — the shape of an i18n
 *  key, as opposed to human prose ("Record created successfully"). Used to
 *  decide whether a server-sent message is safe to translate or should be
 *  replaced by a localized fallback. */
function looksLikeI18nKey(s: string): boolean {
    return /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i.test(s)
}

/**
 * Toast a successful mutation/action response, LOCALIZED. The kernel/host often
 * returns a hardcoded English `message` ("Record created successfully"); echoing
 * it verbatim leaks English into a Spanish UI. So we only translate the server
 * message when it is an i18n KEY (dotted, e.g. "pos.rate.created"); a prose
 * message is dropped in favour of the localized `fallbackKey` (default
 * "common.success"). Pass the app's `t`.
 */
export function toastServerSuccess(
    data: unknown,
    opts?: { t?: Translate; fallbackKey?: string },
): void {
    const t = opts?.t
    const fallbackKey = opts?.fallbackKey ?? 'common.success'
    const fallback = t ? t(fallbackKey, { defaultValue: 'Success' }) : 'Success'
    const msg = (data as { message?: unknown } | undefined)?.message
    if (t && typeof msg === 'string' && msg && looksLikeI18nKey(msg)) {
        toast.success(t(msg, { defaultValue: fallback }))
        return
    }
    toast.success(fallback)
}

/**
 * Toast a server/network error, surfacing the REAL cause as the description
 * instead of a bare generic line. Pass the app's `t` so an i18n-key `message`
 * (e.g. "pos.error.no_rate") is localized; a plain-text message passes through
 * unchanged. Use everywhere a mutation/action can fail.
 */
export function toastServerError(err: unknown, opts?: { t?: Translate; fallback?: string }): void {
    const t = opts?.t
    const fallback =
        opts?.fallback ?? (t ? t('common.error', { defaultValue: 'Something went wrong' }) : 'Something went wrong')
    const { title, description } = extractServerError(err, fallback)
    const shownTitle = t ? t(title, { defaultValue: title }) : title
    toast.error(shownTitle, description ? { description } : undefined)
}
