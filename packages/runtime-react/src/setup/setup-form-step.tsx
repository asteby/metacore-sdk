import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { evaluateVisibleWhen, getVisibleWhen } from '../dynamic-form-schema'
import { groupFieldsBySection } from '../form-layout'
import { FieldSection, WizardProgress } from '../form-layout-ui'
import { useSetupT } from './messages'
import type { SetupField, SetupStepDef, SetupStepState } from './types'

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 800

function initialValues(fields: SetupField[], saved?: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const f of fields) {
        if (f.write_only || f.type === 'secret') continue
        if (saved && f.key in saved) out[f.key] = saved[f.key]
        else if (f.default !== undefined) out[f.key] = f.default
        else if (f.type === 'select' && f.options?.length) out[f.key] = f.options[0].value
    }
    return out
}

const isWriteOnly = (f: SetupField) => !!f.write_only || f.type === 'secret'
const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

export interface SetupFormStepProps {
    step: SetupStepDef
    state?: SetupStepState
    busy?: boolean
    /** Draft autosave; absent → no autosave and no indicator. */
    onAutosave?: (values: Record<string, unknown>) => Promise<void>
    /** Final submit: the dirty values (secrets only when typed). */
    onSubmit: (values: Record<string, unknown>) => void | Promise<void>
}

/**
 * Form step of a setup flow. Sections / wizard sub-steps come from the shared
 * `form-layout` grouping and `form-layout-ui` chrome (the same ones model
 * forms use). `write_only` fields are never read back: the input stays empty
 * and an empty value keeps the stored one. Edits autosave (debounced) and the
 * save state is visible and announced.
 */
export function SetupFormStep({ step, state, busy, onAutosave, onSubmit }: SetupFormStepProps) {
    const t = useSetupT()
    const fields = step.fields ?? []
    const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(fields, state?.values))
    const [stored, setStored] = useState<Set<string>>(() => new Set(state?.stored_keys ?? []))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [autosave, setAutosave] = useState<AutosaveState>('idle')
    const [stepIdx, setStepIdx] = useState(0)
    const dirty = useRef<Set<string>>(new Set())
    const [dirtyTick, setDirtyTick] = useState(0)
    const idPrefix = useId()
    const formRef = useRef<HTMLFormElement>(null)
    const valuesRef = useRef(values)
    valuesRef.current = values

    // Server values arrive (resume / refetch): fill what the person has not touched.
    useEffect(() => {
        if (!state?.values) return
        setValues((prev) => {
            const next = { ...prev }
            for (const [k, v] of Object.entries(state.values!)) if (!dirty.current.has(k)) next[k] = v
            return next
        })
    }, [state?.values])
    useEffect(() => {
        if (state?.stored_keys) setStored(new Set(state.stored_keys))
    }, [state?.stored_keys])

    const setValue = (key: string, v: unknown) => {
        setValues((p) => ({ ...p, [key]: v }))
        dirty.current.add(key)
        setDirtyTick((n) => n + 1)
        if (errors[key]) setErrors(({ [key]: _d, ...rest }) => rest)
    }

    const payloadFor = useCallback(
        (keys: Iterable<string>) => {
            const out: Record<string, unknown> = {}
            const v = valuesRef.current
            for (const k of keys) {
                const f = fields.find((x) => x.key === k)
                if (!f) continue
                if (isWriteOnly(f) && isEmpty(v[k])) continue
                out[k] = v[k]
            }
            return out
        },
        [fields],
    )

    // Debounced autosave of what changed.
    useEffect(() => {
        if (!onAutosave || dirty.current.size === 0) return
        // Write-only fields (secrets) never autosave: a half-typed secret would be
        // stored truncated. They travel only in the explicit submit.
        const snapshot = new Set(
            [...dirty.current].filter((k) => {
                const f = fields.find((x) => x.key === k)
                return !!f && !isWriteOnly(f)
            }),
        )
        if (snapshot.size === 0) return
        const id = setTimeout(async () => {
            const payload = payloadFor(snapshot)
            if (Object.keys(payload).length === 0) return
            setAutosave('saving')
            try {
                await onAutosave(payload)
                for (const k of snapshot) dirty.current.delete(k)
                setAutosave('saved')
            } catch {
                setAutosave('error')
            }
        }, AUTOSAVE_MS)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirtyTick])

    const visible = useMemo(
        () => fields.filter((f) => evaluateVisibleWhen(getVisibleWhen(f), values)),
        [fields, values],
    )
    const layout = step.form_layout
    const groups = useMemo(() => groupFieldsBySection(visible, layout, values), [visible, layout, values])
    const stepMode = layout?.mode === 'steps' && groups.length > 1
    const idx = Math.min(stepIdx, Math.max(0, groups.length - 1))
    const shown = stepMode ? [groups[idx]] : groups

    const labelOf = (f: SetupField) =>
        f.label ?? f.key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

    const submit = async () => {
        const errs: Record<string, string> = {}
        for (const f of visible) {
            if (!f.required || f.type === 'boolean') continue
            if (isWriteOnly(f) && stored.has(f.key)) continue
            if (f.default != null && f.default !== '') continue
            if (isEmpty(values[f.key])) errs[f.key] = t('form.field_required')
        }
        setErrors(errs)
        const missing = Object.keys(errs)
        if (missing.length > 0) {
            const first = fields.find((f) => f.key === missing[0])
            if (stepMode && first) {
                const gi = groups.findIndex((g) => g.fields.some((x) => (x as SetupField).key === first.key))
                if (gi >= 0) setStepIdx(gi)
            }
            window.setTimeout(
                () => formRef.current?.querySelector<HTMLElement>(`[id="${idPrefix}-${missing[0]}"]`)?.focus(),
                30,
            )
            return
        }
        const keys = new Set<string>([...dirty.current, ...visible.filter((f) => !isWriteOnly(f)).map((f) => f.key)])
        await onSubmit(payloadFor(keys))
    }

    const missingList = Object.keys(errors).map((k) => labelOf(fields.find((f) => f.key === k)!)).join(', ')

    return (
        <form
            ref={formRef}
            className='flex flex-col gap-4'
            noValidate
            onSubmit={(e) => {
                e.preventDefault()
                void submit()
            }}
        >
            {stepMode ? (
                <WizardProgress
                    groups={groups}
                    stepIndex={idx}
                    stepLabel={t('form.step')}
                    onStepClick={(i) => setStepIdx(i)}
                />
            ) : null}

            {shown.map((g) => (
                <FieldSection key={g.key} group={g}>
                    <div className='flex flex-col gap-3'>
                        {(g.fields as SetupField[]).map((f) => (
                            <FieldControl
                                key={f.key}
                                field={f}
                                idPrefix={idPrefix}
                                label={labelOf(f)}
                                value={values[f.key]}
                                stored={stored.has(f.key)}
                                error={errors[f.key]}
                                onChange={(v) => setValue(f.key, v)}
                            />
                        ))}
                    </div>
                </FieldSection>
            ))}

            {missingList ? (
                <p role='alert' className='text-sm text-destructive'>
                    {t('form.missing', { fields: missingList })}
                </p>
            ) : null}

            <div className='flex flex-wrap items-center justify-between gap-3'>
                <p
                    role='status'
                    aria-live='polite'
                    className={cn('text-xs', autosave === 'error' ? 'text-destructive' : 'text-muted-foreground')}
                >
                    {autosave === 'saving'
                        ? t('form.saving')
                        : autosave === 'saved'
                          ? t('form.saved')
                          : autosave === 'error'
                            ? t('form.save_error')
                            : ''}
                </p>
                <div className='flex gap-2'>
                    {stepMode && idx > 0 ? (
                        <Button type='button' variant='outline' onClick={() => setStepIdx(idx - 1)}>
                            {t('form.back')}
                        </Button>
                    ) : null}
                    {stepMode && idx < groups.length - 1 ? (
                        <Button type='button' onClick={() => setStepIdx(idx + 1)}>
                            {t('form.next')}
                        </Button>
                    ) : (
                        <Button type='submit' disabled={busy}>
                            {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin motion-reduce:animate-none' aria-hidden='true' /> : null}
                            {step.action_label ?? t('form.continue')}
                        </Button>
                    )}
                </div>
            </div>
        </form>
    )
}

function FieldControl({
    field,
    idPrefix,
    label,
    value,
    stored,
    error,
    onChange,
}: {
    field: SetupField
    idPrefix: string
    label: string
    value: unknown
    stored: boolean
    error?: string
    onChange: (v: unknown) => void
}) {
    const t = useSetupT()
    const id = `${idPrefix}-${field.key}`
    const secret = isWriteOnly(field)
    const describedBy = [field.description ? `${id}-help` : '', error ? `${id}-error` : '', secret && stored ? `${id}-stored` : '']
        .filter(Boolean)
        .join(' ')
    const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy || undefined } as const
    return (
        <div className='flex flex-col gap-1'>
            <Label htmlFor={id}>
                {label}
                {field.required ? <span className='text-destructive' aria-hidden='true'> *</span> : null}
            </Label>
            {field.type === 'boolean' ? (
                <Switch id={id} checked={!!value} onCheckedChange={(c) => onChange(c)} aria-describedby={describedBy || undefined} />
            ) : field.type === 'select' && field.options?.length ? (
                <Select value={String(value ?? '')} onValueChange={(v) => onChange(v)}>
                    <SelectTrigger {...common}>
                        <SelectValue placeholder={t('form.choose')} />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : field.type === 'textarea' ? (
                <Textarea {...common} value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
            ) : (
                <Input
                    {...common}
                    type={secret ? 'password' : field.type === 'number' ? 'number' : 'text'}
                    autoComplete={secret ? 'new-password' : 'off'}
                    data-1p-ignore={secret ? true : undefined}
                    data-lpignore={secret ? 'true' : undefined}
                    spellCheck={false}
                    placeholder={secret && stored ? '••••••••' : field.placeholder}
                    value={String(value ?? '')}
                    className={cn(error && 'border-destructive')}
                    onChange={(e) =>
                        onChange(
                            field.type === 'number'
                                ? e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value)
                                : e.target.value,
                        )
                    }
                />
            )}
            {field.description ? (
                <p id={`${id}-help`} className='text-xs text-muted-foreground'>
                    {field.description}
                </p>
            ) : null}
            {secret && stored ? (
                <p id={`${id}-stored`} className='text-xs text-muted-foreground'>
                    {t('form.stored')}
                </p>
            ) : null}
            {error ? (
                <p id={`${id}-error`} role='alert' className='text-xs text-destructive'>
                    {error}
                </p>
            ) : null}
        </div>
    )
}
