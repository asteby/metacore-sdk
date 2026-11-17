// genui/v2 `settings` block (ADR 0001 del SDK, PR 7 "piloto"): the general,
// non-secret settings of an installed addon drawn from a reference
// `{type:"settings", addon, scope:"org"}`, never inline. It reads and writes
// through the same endpoints the installed-addons dialog uses
// (GET/PUT /addons/:key/settings) and renders with DynamicForm, so it is a
// drop-in replacement for the hand-written settings form there.
//
// Scope of the pilot: org scope only; `write_only` (secret) settings are never
// drawn here (they are never served; the connector/credentials area keeps
// them); `scope: branch` falls back to its `fallback` text. AddonConfigSurface
// is NOT touched by this module: wiring it behind a flag happens once the
// config-modal redesign lands.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { registerGenUIBlockRenderer, type GenUIBlockRendererProps } from '@asteby/metacore-genui'
import { useApi } from '../api-context'
import { DynamicForm } from '../dynamic-form'
import type { ActionFieldDef } from '../types'

export interface SettingDefLike {
    key: string
    label?: string
    type?: string
    default_value?: unknown
    options?: Array<{ value: unknown; label: string }>
    write_only?: boolean
    scope?: string
    visible_when?: unknown
    visibleWhen?: unknown
}

const humanize = (k: string) => k.replace(/[_.-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/**
 * `FromSettings`: projects an addon's setting definitions to form fields.
 * Secrets (`write_only`) and branch-scoped keys are excluded; `keys` narrows to
 * a subset (in the given order). `integer` and `number` become a typed number
 * field (the value is coerced on submit by `coerceSettings`).
 */
export function settingsToFields(defs: SettingDefLike[], keys?: string[], label: (d: SettingDefLike) => string = (d) => d.label || humanize(d.key)): ActionFieldDef[] {
    const usable = defs.filter((d) => !d.write_only && (d.scope ?? 'org') === 'org')
    const picked = keys?.length ? keys.map((k) => usable.find((d) => d.key === k)).filter((d): d is SettingDefLike => !!d) : usable
    return picked.map((d) => {
        const options = d.options?.map((o) => ({ value: String(o.value), label: o.label }))
        const type = options?.length ? 'select' : d.type === 'integer' || d.type === 'number' ? 'number' : d.type === 'boolean' ? 'boolean' : d.type === 'textarea' ? 'textarea' : 'text'
        const field: ActionFieldDef & { visibleWhen?: unknown } = { key: d.key, label: label(d), type, options, defaultValue: d.default_value }
        const vw = d.visible_when ?? d.visibleWhen
        if (vw) field.visibleWhen = vw
        return field
    })
}

/** Typed payload: integers go as integers, numbers as numbers (the legacy form sent text). */
export function coerceSettings(values: Record<string, unknown>, defs: SettingDefLike[]): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values }
    for (const d of defs) {
        if (!Object.hasOwn(out, d.key)) continue
        const v = out[d.key]
        if (d.type === 'integer' || d.type === 'number') {
            if (v === '' || v === null || v === undefined) delete out[d.key]
            else {
                const n = Number(v)
                out[d.key] = d.type === 'integer' ? Math.trunc(n) : n
            }
        }
    }
    return out
}

/** The `settings` block renderer. */
export function SettingsBlock({ block, text }: GenUIBlockRendererProps) {
    const api = useApi()
    const { t } = useTranslation()
    const addon = String(block.addon)
    const [state, setState] = React.useState<{ values: Record<string, unknown>; defs: SettingDefLike[] } | 'loading' | 'error'>('loading')
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)

    React.useEffect(() => {
        let alive = true
        setState('loading')
        api
            .get(`/addons/${addon}/settings`)
            .then((res) => alive && setState({ values: res.data?.data ?? {}, defs: res.data?.definitions ?? [] }))
            .catch(() => alive && setState('error'))
        return () => {
            alive = false
        }
    }, [api, addon])

    if (block.scope === 'branch') return block.fallback ? <p className="m-0 text-sm text-muted-foreground">{block.fallback}</p> : null
    if (state === 'loading') return <div aria-busy="true" role="status" aria-label={t('metacore.genui.loading', { defaultValue: 'Cargando ajustes…' })} className="h-24" />
    if (state === 'error') return <p role="alert" className="m-0 text-sm text-destructive">{t('metacore.genui.settings_error', { defaultValue: 'No se pudieron cargar los ajustes.' })}</p>

    const fields = settingsToFields(state.defs, block.keys, (d) => (d.label ? t(d.label, { defaultValue: humanize(d.key) }) : humanize(d.key)))
    if (fields.length === 0) return null
    const initial = Object.fromEntries(fields.map((f) => [f.key, state.values[f.key] ?? f.defaultValue]))
    return (
        <div data-genui-block="settings" className="flex flex-col gap-2">
            {block.title ? <p className="m-0 text-sm font-semibold">{text(block.title)}</p> : null}
            <DynamicForm
                fields={fields}
                initialValues={initial}
                submitLabel={t('metacore.genui.save', { defaultValue: 'Guardar' })}
                onSubmit={async (values) => {
                    setMsg(null)
                    try {
                        await api.put(`/addons/${addon}/settings`, coerceSettings(values, state.defs))
                        setMsg({ ok: true, text: t('metacore.genui.saved', { defaultValue: 'Guardado.' }) })
                    } catch (e) {
                        const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                        setMsg({ ok: false, text: m || t('metacore.genui.settings_save_error', { defaultValue: 'No se pudo guardar.' }) })
                    }
                }}
            />
            {msg ? <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'm-0 text-sm text-muted-foreground' : 'm-0 text-sm text-destructive'}>{msg.text}</p> : null}
        </div>
    )
}

/** Registers the `settings` block (pilot). Returns a function that restores the previous renderer. */
export function registerGenUISettingsBlock(): () => void {
    return registerGenUIBlockRenderer('settings', SettingsBlock)
}
