// Stage automations — a Bitrix-style "when a card enters this stage, run these
// actions" rule editor, surfaced per-lane in DynamicKanban. The feature is
// generic over any model: rules live server-side (the host wires the
// `/stage-automations` REST endpoints against the same api client the rest of
// the dynamic runtime uses) and reference the model's own columns.
//
// Non-intrusive by design: if the endpoint 404s or errors, the hook reports
// `available: false` and the lane simply omits the ⚡ affordance — the board
// keeps working. All UI text goes through t() with a Spanish defaultValue so a
// host that ships no `dynamic.automations.*` keys still renders in Spanish.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '@asteby/metacore-ui/primitives'
import { useApi } from './api-context'
import type { ApiClient } from './api-context'
import type { ColumnDefinition } from './types'

// ---------------------------------------------------------------------------
// Contract (matches the ops backend; envelope is {success, data} → read .data)
// ---------------------------------------------------------------------------

export type StageAutomationActionType = 'add_tag' | 'remove_tag' | 'set_field'

export interface StageAutomationAction {
    type: StageAutomationActionType
    field: string
    value: string
}

export interface StageAutomation {
    id: string | number
    model: string
    /** Source stage the card is leaving. `'*'` = any stage. */
    from_stage: string
    /** Destination stage that triggers the rule (the lane's stage key). */
    to_stage: string
    actions: StageAutomationAction[]
    enabled: boolean
}

/** Draft for a new rule — a single action, keyed to a destination stage. */
export interface NewStageAutomation {
    model: string
    from_stage: string
    to_stage: string
    actions: StageAutomationAction[]
    enabled: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no React, no transport)
// ---------------------------------------------------------------------------

const ACTION_TYPES: StageAutomationActionType[] = [
    'add_tag',
    'remove_tag',
    'set_field',
]

/** Whether a column holds a tag/json array (valid target for add/remove_tag). */
export function isTagColumn(col: ColumnDefinition): boolean {
    const t = col.type
    const style = (col as { cellStyle?: string }).cellStyle
    return t === 'tags' || t === ('json' as ColumnDefinition['type']) || style === 'tags'
}

/**
 * Columns a given action type may target:
 *   - add_tag / remove_tag → only tag/json columns
 *   - set_field            → any editable (non-readonly, non-hidden) column
 * Hidden and readonly columns are never offered.
 */
export function automationFieldOptions(
    columns: ColumnDefinition[],
    actionType: StageAutomationActionType,
): ColumnDefinition[] {
    return columns.filter((c) => {
        if (c.hidden) return false
        const ro = !!(c as { readonly?: boolean; read_only?: boolean }).readonly ||
            !!(c as { readonly?: boolean; read_only?: boolean }).read_only
        if (ro) return false
        if (actionType === 'add_tag' || actionType === 'remove_tag') {
            return isTagColumn(c)
        }
        return true
    })
}

/** Rules grouped by their destination stage key (only what the lane needs). */
export function groupAutomationsByStage(
    rules: StageAutomation[],
): Map<string, StageAutomation[]> {
    const map = new Map<string, StageAutomation[]>()
    for (const r of rules) {
        const arr = map.get(r.to_stage) ?? []
        arr.push(r)
        map.set(r.to_stage, arr)
    }
    return map
}

/** Count of ENABLED rules for a stage — drives the lane's ⚡ indicator. */
export function activeAutomationCount(rules: StageAutomation[] | undefined): number {
    if (!rules) return 0
    return rules.filter((r) => r.enabled).length
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function unwrap(res: { data: any }): any {
    const body = res?.data
    // Envelope {success, data}; tolerate a bare array/object too.
    if (body && typeof body === 'object' && 'data' in body) return body.data
    return body
}

export interface UseStageAutomationsResult {
    /** False when the endpoint is missing/errored — hide the ⚡ affordance. */
    available: boolean
    loading: boolean
    /** Destination-stage-keyed rules. */
    byStage: Map<string, StageAutomation[]>
    create: (draft: NewStageAutomation) => Promise<void>
    update: (id: StageAutomation['id'], patch: Partial<StageAutomation>) => Promise<void>
    remove: (id: StageAutomation['id']) => Promise<void>
}

/**
 * Loads a model's stage automations and exposes CRUD. Swallows a missing
 * endpoint (404 / network error) into `available: false` so the kanban never
 * breaks; real mutation failures surface a toast and re-throw so the dialog can
 * keep its draft.
 */
export function useStageAutomations(model: string): UseStageAutomationsResult {
    const api = useApi()
    const { t } = useTranslation()
    const [available, setAvailable] = useState(true)
    const [loading, setLoading] = useState(true)
    const [rules, setRules] = useState<StageAutomation[]>([])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.get(`/stage-automations?model=${encodeURIComponent(model)}`)
            const data = unwrap(res)
            setRules(Array.isArray(data) ? data : [])
            setAvailable(true)
        } catch {
            // Endpoint absent or errored — degrade silently.
            setRules([])
            setAvailable(false)
        } finally {
            setLoading(false)
        }
    }, [api, model])

    useEffect(() => {
        void load()
    }, [load])

    const create = useCallback(
        async (draft: NewStageAutomation) => {
            try {
                const res = await api.post('/stage-automations', draft)
                const created = unwrap(res) as StageAutomation | null
                await load()
                if (!created) return
            } catch (e) {
                toast.error(
                    t('dynamic.automations.saveError', {
                        defaultValue: 'No se pudo guardar la automatización',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    const update = useCallback(
        async (id: StageAutomation['id'], patch: Partial<StageAutomation>) => {
            try {
                await api.put(`/stage-automations/${id}`, patch)
                await load()
            } catch (e) {
                toast.error(
                    t('dynamic.automations.saveError', {
                        defaultValue: 'No se pudo guardar la automatización',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    const remove = useCallback(
        async (id: StageAutomation['id']) => {
            try {
                await api.delete(`/stage-automations/${id}`)
                await load()
            } catch (e) {
                toast.error(
                    t('dynamic.automations.deleteError', {
                        defaultValue: 'No se pudo eliminar la automatización',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    const byStage = useMemo(() => groupAutomationsByStage(rules), [rules])

    return { available, loading, byStage, create, update, remove }
}

// ---------------------------------------------------------------------------
// Lane affordance + dialog
// ---------------------------------------------------------------------------

export interface StageAutomationsButtonProps {
    model: string
    /** The lane's stage key + human label (destination that triggers rules). */
    stageKey: string
    stageLabel: string
    columns: ColumnDefinition[]
    rules: StageAutomation[]
    onCreate: (draft: NewStageAutomation) => Promise<void>
    onUpdate: (id: StageAutomation['id'], patch: Partial<StageAutomation>) => Promise<void>
    onRemove: (id: StageAutomation['id']) => Promise<void>
}

/**
 * The per-lane ⚡ button: shows an active-rule count badge and opens the rule
 * editor for THIS stage. Rendered only when the endpoint is available.
 */
export function StageAutomationsButton({
    model,
    stageKey,
    stageLabel,
    columns,
    rules,
    onCreate,
    onUpdate,
    onRemove,
}: StageAutomationsButtonProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const activeCount = activeAutomationCount(rules)

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`relative flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
                    activeCount > 0 ? 'text-primary' : 'text-muted-foreground'
                }`}
                aria-label={t('dynamic.automations.open', {
                    defaultValue: 'Automatizaciones de la etapa',
                })}
                data-testid={`automations-trigger-${stageKey}`}
            >
                <Zap className="h-3.5 w-3.5" />
                {activeCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                        {activeCount}
                    </span>
                )}
            </button>
            {open && (
                <StageAutomationsDialog
                    open={open}
                    onOpenChange={setOpen}
                    model={model}
                    stageKey={stageKey}
                    stageLabel={stageLabel}
                    columns={columns}
                    rules={rules}
                    onCreate={onCreate}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                />
            )}
        </>
    )
}

interface StageAutomationsDialogProps extends StageAutomationsButtonProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function describeAction(
    action: StageAutomationAction,
    columns: ColumnDefinition[],
    t: ReturnType<typeof useTranslation>['t'],
): string {
    const col = columns.find((c) => c.key === action.field)
    const fieldLabel = col ? t(col.label, { defaultValue: col.label }) : action.field
    switch (action.type) {
        case 'add_tag':
            return t('dynamic.automations.summary.addTag', {
                defaultValue: 'Agregar tag "{{value}}" a {{field}}',
                value: action.value,
                field: fieldLabel,
            })
        case 'remove_tag':
            return t('dynamic.automations.summary.removeTag', {
                defaultValue: 'Quitar tag "{{value}}" de {{field}}',
                value: action.value,
                field: fieldLabel,
            })
        default:
            return t('dynamic.automations.summary.setField', {
                defaultValue: 'Setear {{field}} = "{{value}}"',
                value: action.value,
                field: fieldLabel,
            })
    }
}

function StageAutomationsDialog({
    open,
    onOpenChange,
    model,
    stageKey,
    stageLabel,
    columns,
    rules,
    onCreate,
    onUpdate,
    onRemove,
}: StageAutomationsDialogProps) {
    const { t } = useTranslation()
    const [actionType, setActionType] = useState<StageAutomationActionType>('add_tag')
    const [field, setField] = useState('')
    const [value, setValue] = useState('')
    const [saving, setSaving] = useState(false)

    const fieldChoices = useMemo(
        () => automationFieldOptions(columns, actionType),
        [columns, actionType],
    )

    // Keep the selected field valid for the current action type.
    useEffect(() => {
        if (!fieldChoices.some((c) => c.key === field)) {
            setField(fieldChoices[0]?.key ?? '')
        }
    }, [fieldChoices, field])

    const label = t(stageLabel, { defaultValue: stageLabel })

    const canSubmit = !!field && !!value.trim() && !saving

    const submit = async () => {
        if (!canSubmit) return
        setSaving(true)
        try {
            await onCreate({
                model,
                from_stage: '*',
                to_stage: stageKey,
                actions: [{ type: actionType, field, value: value.trim() }],
                enabled: true,
            })
            setValue('')
            toast.success(
                t('dynamic.automations.saved', {
                    defaultValue: 'Automatización guardada',
                }),
            )
        } catch {
            // toast already surfaced by the hook; keep the draft.
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {t('dynamic.automations.title', {
                            defaultValue: 'Automatizaciones · {{stage}}',
                            stage: label,
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {t('dynamic.automations.description', {
                            defaultValue:
                                'Al entrar una tarjeta a esta etapa se ejecutan estas acciones.',
                        })}
                    </DialogDescription>
                </DialogHeader>

                {/* Existing rules for this stage */}
                <div className="flex flex-col gap-2">
                    {rules.length === 0 ? (
                        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                            {t('dynamic.automations.empty', {
                                defaultValue: 'Sin automatizaciones para esta etapa.',
                            })}
                        </p>
                    ) : (
                        rules.map((rule) => (
                            <div
                                key={String(rule.id)}
                                className="flex items-center gap-2 rounded-md border px-3 py-2"
                                data-testid={`automation-rule-${rule.id}`}
                            >
                                <div className="min-w-0 flex-1">
                                    {rule.actions.map((a, i) => (
                                        <p
                                            key={i}
                                            className={`truncate text-sm ${
                                                rule.enabled ? '' : 'text-muted-foreground line-through'
                                            }`}
                                        >
                                            {describeAction(a, columns, t)}
                                        </p>
                                    ))}
                                </div>
                                <Switch
                                    checked={rule.enabled}
                                    onCheckedChange={(checked) =>
                                        void onUpdate(rule.id, { enabled: checked })
                                    }
                                    aria-label={t('dynamic.automations.toggle', {
                                        defaultValue: 'Activar automatización',
                                    })}
                                    data-testid={`automation-toggle-${rule.id}`}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                        void onRemove(rule.id).then(() =>
                                            toast.success(
                                                t('dynamic.automations.deleted', {
                                                    defaultValue: 'Automatización eliminada',
                                                }),
                                            ),
                                        )
                                    }}
                                    aria-label={t('dynamic.automations.delete', {
                                        defaultValue: 'Eliminar automatización',
                                    })}
                                    data-testid={`automation-delete-${rule.id}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>

                {/* New rule form */}
                <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.automations.actionLabel', {
                                defaultValue: 'Acción',
                            })}
                        </Label>
                        <Select
                            value={actionType}
                            onValueChange={(v) => setActionType(v as StageAutomationActionType)}
                        >
                            <SelectTrigger data-testid="automation-action-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ACTION_TYPES.map((at) => (
                                    <SelectItem key={at} value={at}>
                                        {t(`dynamic.automations.action.${at}`, {
                                            defaultValue:
                                                at === 'add_tag'
                                                    ? 'Agregar tag'
                                                    : at === 'remove_tag'
                                                    ? 'Quitar tag'
                                                    : 'Setear campo',
                                        })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.automations.fieldLabel', {
                                defaultValue: 'Campo',
                            })}
                        </Label>
                        <Select
                            value={field}
                            onValueChange={setField}
                            disabled={fieldChoices.length === 0}
                        >
                            <SelectTrigger data-testid="automation-field-select">
                                <SelectValue
                                    placeholder={t('dynamic.automations.noFields', {
                                        defaultValue: 'Sin campos',
                                    })}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {fieldChoices.map((c) => (
                                    <SelectItem key={c.key} value={c.key}>
                                        {t(c.label, { defaultValue: c.label })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.automations.valueLabel', {
                                defaultValue: 'Valor',
                            })}
                        </Label>
                        <Input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void submit()
                            }}
                            placeholder={t('dynamic.automations.valuePlaceholder', {
                                defaultValue: 'Valor...',
                            })}
                            data-testid="automation-value-input"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        onClick={() => void submit()}
                        disabled={!canSubmit}
                        className="gap-1"
                        data-testid="automation-add"
                    >
                        <Plus className="h-4 w-4" />
                        {t('dynamic.automations.add', {
                            defaultValue: 'Agregar regla',
                        })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Re-export the api client type so hosts can see the transport contract.
export type { ApiClient }
