// Option fitment — the picker side of `Column.option_fitment` (manifest v3): the
// options of a relation picker are checked against a SUBJECT picked in another
// field of the same form (a document header, a sibling field) using the
// organization's fitment rules, and flagged (default) or hidden (`filter`).
// Pure pieces here; the hook below wires them to the host client. A column
// without the declaration behaves exactly as before.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOptionalApi, type ApiClient } from '../api-context'
import type { ResolvedOption } from '../use-options-resolver'
import type { OptionBadgeItem } from '../option-display'
import type { FitmentAttrs, FitState } from './match'
import { useFitment } from './use-fitment'

export interface OptionFitmentSpec {
    subject_field: string
    subject_model: string
    target_model: string
    /** `flag` (default) marks non-fitting options; `filter` hides them. */
    mode?: 'flag' | 'filter'
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** Reads the declaration off a field (snake_case as served, or camelCase). Null when absent or malformed. */
export function getOptionFitment(field: unknown): OptionFitmentSpec | null {
    if (!field || typeof field !== 'object') return null
    const f = field as { option_fitment?: unknown; optionFitment?: unknown }
    const raw = f.option_fitment ?? f.optionFitment
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const subjectField = r.subject_field ?? r.subjectField
    const subjectModel = r.subject_model ?? r.subjectModel
    const targetModel = r.target_model ?? r.targetModel
    if (!isText(subjectField) || !isText(subjectModel) || !isText(targetModel)) return null
    return {
        subject_field: subjectField,
        subject_model: subjectModel,
        target_model: targetModel,
        mode: r.mode === 'filter' ? 'filter' : 'flag',
    }
}

/**
 * Value of the subject field: the row first, then the header form (the same
 * order a `depends_on` cascade resolves). Empty string when not set.
 */
export function resolveFitmentSubjectId(
    spec: OptionFitmentSpec | null,
    formValues?: Record<string, unknown>,
    rowValues?: Record<string, unknown>,
): string {
    if (!spec) return ''
    const pick = (bag?: Record<string, unknown>) => {
        const v = bag?.[spec.subject_field]
        return v === undefined || v === null || v === '' ? '' : String(v)
    }
    return pick(rowValues) || pick(formValues)
}

/** Model key of a `ref` such as `products.Product` (the data API is keyed by the model, not the addon). */
export function modelOfRef(ref: string | undefined): string {
    if (!ref) return ''
    const i = ref.lastIndexOf('.')
    return i >= 0 ? ref.slice(i + 1) : ref
}

export interface FitBadgeText {
    fits: string
    no: string
}

/**
 * Applies fit states to resolved options. `filter` drops the options that do not
 * fit (never the current selection, so its label survives); `flag` keeps every
 * option, dims the non-fitting ones and adds a badge through the existing
 * option `display` (`unknown` options are left untouched: no data is not a
 * mismatch). Returns the SAME array when nothing changes.
 */
export function applyOptionFitment(
    options: ResolvedOption[],
    states: ReadonlyMap<string, FitState>,
    mode: 'flag' | 'filter',
    text: FitBadgeText,
    keepValue?: unknown,
): ResolvedOption[] {
    if (states.size === 0) return options
    const keep = keepValue === undefined || keepValue === null || keepValue === '' ? null : String(keepValue)
    if (mode === 'filter') {
        const kept = options.filter((o) => (keep !== null && String(o.id) === keep) || states.get(String(o.id)) !== 'no')
        return kept.length === options.length ? options : kept
    }
    let changed = false
    const out = options.map((o) => {
        const state = states.get(String(o.id))
        if (state !== 'fits' && state !== 'no') return o
        changed = true
        const badge: OptionBadgeItem = state === 'fits' ? { text: text.fits, tone: 'success' } : { text: text.no, tone: 'warning' }
        const d = o.display ?? {}
        return {
            ...o,
            fit: state,
            display: { ...d, title: d.title ?? o.label, badges: [...(d.badges ?? []), badge], ...(state === 'no' ? { dimmed: true } : {}) },
        }
    })
    return changed ? out : options
}

const subjectCache = new WeakMap<object, Map<string, Promise<FitmentAttrs | null>>>()
const targetCache = new WeakMap<object, Map<string, Promise<FitmentAttrs | null>>>()

function rowsOf(body: unknown): Record<string, unknown>[] {
    const d = (body as { data?: unknown } | undefined)?.data
    if (Array.isArray(d)) return d as Record<string, unknown>[]
    const items = (d as { items?: unknown } | undefined)?.items
    return Array.isArray(items) ? (items as Record<string, unknown>[]) : []
}

async function fetchRowsById(client: Pick<ApiClient, 'get'>, model: string, ids: string[]): Promise<Record<string, unknown>[]> {
    const res = await client.get(`/data/${model}`, { params: { f_id: `in:${ids.join(',')}`, per_page: Math.min(Math.max(ids.length, 1), 200), page: 1 } })
    return rowsOf(res.data)
}

function cached(
    store: WeakMap<object, Map<string, Promise<FitmentAttrs | null>>>,
    client: object,
    key: string,
    load: () => Promise<FitmentAttrs | null>,
): Promise<FitmentAttrs | null> {
    const m = store.get(client) ?? new Map<string, Promise<FitmentAttrs | null>>()
    store.set(client, m)
    const hit = m.get(key)
    if (hit) return hit
    const p = load().catch((e) => {
        m.delete(key) // a failed read is retried next time
        throw e
    })
    m.set(key, p)
    return p
}

/** Drops cached subject / target rows (tests, or after editing them). */
export function resetOptionFitmentCache(client: object) {
    subjectCache.delete(client)
    targetCache.delete(client)
}

/** Subject row (a Vehicle, a device…) by id, cached per client. */
export function loadSubjectRow(client: Pick<ApiClient, 'get'>, model: string, id: string): Promise<FitmentAttrs | null> {
    return cached(subjectCache, client, `${model}:${id}`, async () => (await fetchRowsById(client, model, [id]))[0] ?? null)
}

/**
 * Rows of the option source for the given ids (their extension columns
 * `"<TargetModel>.<col>"` carry the attributes the rules compare), cached per id.
 * One request for the ids not cached yet.
 */
export async function loadTargetRows(client: Pick<ApiClient, 'get'>, model: string, ids: string[]): Promise<Map<string, FitmentAttrs>> {
    const out = new Map<string, FitmentAttrs>()
    const missing = ids.filter((id) => !targetCache.get(client)?.has(`${model}:${id}`))
    if (missing.length > 0) {
        const batch = fetchRowsById(client, model, missing)
        for (const id of missing) {
            cached(targetCache, client, `${model}:${id}`, async () => {
                const rows = await batch
                return rows.find((r) => String(r.id) === id) ?? null
            }).catch(() => undefined)
        }
    }
    await Promise.all(
        ids.map(async (id) => {
            const row = await cached(targetCache, client, `${model}:${id}`, async () => null).catch(() => null)
            if (row) out.set(id, row)
        }),
    )
    return out
}

export interface UseOptionFitmentArgs {
    spec: OptionFitmentSpec | null
    /** Id of the subject (see `resolveFitmentSubjectId`). */
    subjectId: string
    /** Model key the options come from (`modelOfRef(ref)`). */
    sourceModel: string
    options: ResolvedOption[]
    keepValue?: unknown
    client?: Pick<ApiClient, 'get'>
}

/**
 * Flags / filters `options` by fit. Inert (returns the options untouched) when
 * the column declares no fitment, no subject is chosen yet, the subject has no
 * rules for the target model, or anything fails to load.
 */
export function useOptionFitment({ spec, subjectId, sourceModel, options, keepValue, client }: UseOptionFitmentArgs): ResolvedOption[] {
    const { t } = useTranslation()
    const ctx = useOptionalApi()
    const api = client ?? ctx
    const active = !!spec && !!subjectId && !!api && !!sourceModel
    const [subject, setSubject] = useState<FitmentAttrs | null>(null)
    const [targets, setTargets] = useState<Map<string, FitmentAttrs>>(new Map())

    useEffect(() => {
        if (!active || !api || !spec) {
            setSubject(null)
            return
        }
        let cancelled = false
        loadSubjectRow(api, spec.subject_model, subjectId)
            .then((row) => !cancelled && setSubject(row))
            .catch(() => !cancelled && setSubject(null))
        return () => {
            cancelled = true
        }
    }, [active, api, spec?.subject_model, subjectId])

    const fitment = useFitment({
        client: api ?? undefined,
        subjectModel: spec?.subject_model,
        subject: active ? subject : null,
        targetModel: spec?.target_model,
        enabled: active,
    })

    const idsKey = options.map((o) => String(o.id)).join(',')
    useEffect(() => {
        if (!active || !api || !fitment.hasRules || idsKey === '') {
            setTargets(new Map())
            return
        }
        let cancelled = false
        loadTargetRows(api, sourceModel, idsKey.split(','))
            .then((m) => !cancelled && setTargets(m))
            .catch(() => !cancelled && setTargets(new Map()))
        return () => {
            cancelled = true
        }
    }, [active, api, sourceModel, fitment.hasRules, idsKey])

    const fitsText = t('fitment.fits', { defaultValue: 'Compatible' })
    const noText = t('fitment.no', { defaultValue: 'No compatible' })
    return useMemo(() => {
        if (!spec || !active || !fitment.hasRules || targets.size === 0) return options
        const states = new Map<string, FitState>()
        for (const o of options) {
            const row = targets.get(String(o.id))
            if (row) states.set(String(o.id), fitment.fit(row))
        }
        return applyOptionFitment(options, states, spec.mode ?? 'flag', { fits: fitsText, no: noText }, keepValue)
    }, [options, spec, active, fitment, targets, keepValue, fitsText, noText])
}
