// Custom stages — a Bitrix-style "add your own column" affordance for
// DynamicKanban, generic over any model. Two flavors:
//
//   - type: "stage"  → a REAL lane. The backend persists it and also surfaces
//     it in the model's `metadata.stages`, so cards drag in/out of it exactly
//     like a declared stage. We only add the create/edit/delete UI + merge any
//     custom stage the metadata hasn't caught up to yet (tolerant).
//
//   - type: "smart"  → a VIRTUAL lane. Nothing is stored on the card; the lane
//     is defined by a set of `filters` and is populated by querying the list
//     with those filters (the same `f_<field>=value` params the board already
//     speaks). Cards in a smart lane are read-only (no drag), and the header
//     shows a funnel icon.
//
// Non-intrusive by design: the CRUD lives server-side behind `/custom-stages`
// (same api client as the rest of the dynamic runtime). If the endpoint 404s
// or errors the hook reports `available: false`, the "+ Agregar etapa" column
// and the lane context menus simply don't render, and the board keeps working.
// All UI text goes through t() with a Spanish defaultValue.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, MoreVertical, Filter, X } from 'lucide-react'
import { toast } from 'sonner'
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
} from '@asteby/metacore-ui/primitives'
import { generateBadgeStyles, optionColor } from '@asteby/metacore-ui/lib'
import { useApi } from './api-context'
import type { ApiClient } from './api-context'
import type { ColumnDefinition, StageMeta, ApiResponse } from './types'

// ---------------------------------------------------------------------------
// Contract (matches the ops backend; envelope is {success, data} → read .data)
// ---------------------------------------------------------------------------

export type CustomStageType = 'stage' | 'smart'
export type CustomStageFilterOp = 'eq' | 'neq' | 'contains' | 'in'

export interface CustomStageFilter {
    field: string
    op: CustomStageFilterOp
    value: string
}

export interface CustomStage {
    id: string | number
    model: string
    /** Stable lane key (also the value stored on a card for `type: "stage"`). */
    key: string
    label: string
    /** Semantic palette name ('slate', 'blue', …) or a hex literal. */
    color: string
    /** Board position (lane order). */
    position: number
    type: CustomStageType
    /** Only meaningful for `type: "smart"` — the virtual lane's funnel. */
    filters: CustomStageFilter[]
    enabled: boolean
}

/** Draft for a new custom stage (no server id yet). */
export type NewCustomStage = Omit<CustomStage, 'id'>

// ~8 preset palette names understood by `generateBadgeStyles`.
export const CUSTOM_STAGE_COLORS = [
    'slate',
    'blue',
    'green',
    'amber',
    'red',
    'purple',
    'pink',
    'cyan',
] as const

export const CUSTOM_STAGE_FILTER_OPS: CustomStageFilterOp[] = [
    'eq',
    'neq',
    'contains',
    'in',
]

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no React, no transport)
// ---------------------------------------------------------------------------

/** A blank filter row for the smart-lane condition builder. */
export function emptyCustomStageFilter(field = ''): CustomStageFilter {
    return { field, op: 'eq', value: '' }
}

/** Enabled custom stages split by flavor (disabled ones are dropped). */
export function splitCustomStages(stages: CustomStage[] | undefined): {
    laneStages: CustomStage[]
    smartStages: CustomStage[]
} {
    const laneStages: CustomStage[] = []
    const smartStages: CustomStage[] = []
    for (const s of stages ?? []) {
        if (s.enabled === false) continue
        if (s.type === 'smart') smartStages.push(s)
        else laneStages.push(s)
    }
    return { laneStages, smartStages }
}

/**
 * Merges `type: "stage"` custom stages into the model's declared lanes. A
 * custom stage whose key the metadata ALREADY carries (the backend surfaced it
 * in `metadata.stages`) is not duplicated — it's just tagged as custom so the
 * lane grows an edit/delete menu. Unknown-key custom stages are appended.
 * Returns the merged lanes (sorted by order) plus a `key → CustomStage` map so
 * the board can decorate the custom lanes.
 */
export function mergeLaneStages(
    declared: StageMeta[],
    customLaneStages: CustomStage[],
): { lanes: StageMeta[]; customByKey: Map<string, CustomStage> } {
    const customByKey = new Map<string, CustomStage>()
    for (const cs of customLaneStages) customByKey.set(cs.key, cs)
    const present = new Set(declared.map((s) => s.key))
    const lanes: StageMeta[] = [...declared]
    for (const cs of customLaneStages) {
        if (present.has(cs.key)) continue
        lanes.push({
            key: cs.key,
            label: cs.label,
            color: cs.color,
            order: cs.position,
        })
    }
    lanes.sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER
        const bo = b.order ?? Number.MAX_SAFE_INTEGER
        return ao - bo
    })
    return { lanes, customByKey }
}

/**
 * Serializes a smart lane's filters into the board's list query params. Mirrors
 * the `f_<field>=value` convention the kanban already uses for stage scoping:
 *   - eq       → `f_<field>=value`
 *   - neq      → `f_<field>__neq=value`
 *   - contains → `f_<field>__contains=value`
 *   - in       → `f_<field>=v1,v2` (comma-separated — the backend already
 *                splits multi-value stage filters this way)
 * Empty fields/values are skipped. Provisional operator suffixes: kept in this
 * one pure function so the ops-confirmed syntax is a one-line change + a test.
 */
export function smartLaneParams(
    filters: CustomStageFilter[] | undefined,
): Record<string, string> {
    const params: Record<string, string> = {}
    for (const f of filters ?? []) {
        if (!f.field || f.value == null || String(f.value).trim() === '') continue
        const v = String(f.value).trim()
        switch (f.op) {
            case 'neq':
                params[`f_${f.field}__neq`] = v
                break
            case 'contains':
                params[`f_${f.field}__contains`] = v
                break
            case 'in':
            case 'eq':
            default:
                params[`f_${f.field}`] = v
        }
    }
    return params
}

/** Columns offered in the condition builder: visible, non-id model columns. */
export function customStageFilterFields(
    columns: ColumnDefinition[],
): ColumnDefinition[] {
    return columns.filter((c) => !c.hidden && c.key !== 'id')
}

/** Whether a draft is complete enough to save. */
export function isCustomStageDraftValid(draft: {
    label: string
    type: CustomStageType
    filters: CustomStageFilter[]
}): boolean {
    if (!draft.label.trim()) return false
    if (draft.type === 'smart') {
        return draft.filters.some(
            (f) => f.field && String(f.value).trim() !== '',
        )
    }
    return true
}

/** Slugify a label into a stable-ish lane key (used only when creating). */
export function slugifyStageKey(label: string): string {
    return (
        label
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48) || `stage_${Date.now().toString(36)}`
    )
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function unwrap(res: { data: any }): any {
    const body = res?.data
    if (body && typeof body === 'object' && 'data' in body) return body.data
    return body
}

export interface UseCustomStagesResult {
    /** False when the endpoint is missing/errored — hide the whole feature. */
    available: boolean
    loading: boolean
    stages: CustomStage[]
    create: (draft: NewCustomStage) => Promise<void>
    update: (id: CustomStage['id'], patch: Partial<CustomStage>) => Promise<void>
    /** Throws on 409 (cards still on the stage) so the caller can offer a fix. */
    remove: (id: CustomStage['id']) => Promise<void>
}

/**
 * Loads a model's custom stages and exposes CRUD. A missing endpoint (404 /
 * network error) degrades to `available: false` so the kanban never breaks;
 * real mutation failures surface a toast and re-throw so the dialog keeps its
 * draft. A 409 on delete (existing cards) is re-thrown WITHOUT a generic toast
 * so the delete flow can show a targeted message.
 */
export function useCustomStages(model: string): UseCustomStagesResult {
    const api = useApi()
    const { t } = useTranslation()
    const [available, setAvailable] = useState(true)
    const [loading, setLoading] = useState(true)
    const [stages, setStages] = useState<CustomStage[]>([])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.get(
                `/custom-stages?model=${encodeURIComponent(model)}`,
            )
            const data = unwrap(res)
            setStages(Array.isArray(data) ? data : [])
            setAvailable(true)
        } catch {
            setStages([])
            setAvailable(false)
        } finally {
            setLoading(false)
        }
    }, [api, model])

    useEffect(() => {
        void load()
    }, [load])

    const create = useCallback(
        async (draft: NewCustomStage) => {
            try {
                await api.post('/custom-stages', draft)
                await load()
            } catch (e) {
                toast.error(
                    t('dynamic.custom_stages.save_error', {
                        defaultValue: 'No se pudo guardar la etapa',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    const update = useCallback(
        async (id: CustomStage['id'], patch: Partial<CustomStage>) => {
            try {
                await api.put(`/custom-stages/${id}`, patch)
                await load()
            } catch (e) {
                toast.error(
                    t('dynamic.custom_stages.save_error', {
                        defaultValue: 'No se pudo guardar la etapa',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    const remove = useCallback(
        async (id: CustomStage['id']) => {
            try {
                await api.delete(`/custom-stages/${id}`)
                await load()
            } catch (e: any) {
                // 409 = the stage still holds cards; let the caller decide how to
                // surface it (reassign prompt) instead of a generic error toast.
                if (e?.response?.status === 409) throw e
                toast.error(
                    t('dynamic.custom_stages.delete_error', {
                        defaultValue: 'No se pudo eliminar la etapa',
                    }),
                )
                throw e
            }
        },
        [api, load, t],
    )

    return { available, loading, stages, create, update, remove }
}

// ---------------------------------------------------------------------------
// "+ Agregar etapa" ghost column
// ---------------------------------------------------------------------------

export interface AddStageColumnProps {
    onClick: () => void
}

/** The dotted phantom lane at the end of the board (Bitrix/Trello pattern). */
export function AddStageColumn({ onClick }: AddStageColumnProps) {
    const { t } = useTranslation()
    return (
        <button
            type="button"
            onClick={onClick}
            className="group/add flex min-h-[55vh] min-w-[220px] max-w-[280px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-transparent p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground"
            data-testid="kanban-add-stage"
        >
            <span className="flex size-9 items-center justify-center rounded-full border border-dashed transition-colors group-hover/add:border-primary/50">
                <Plus className="h-4 w-4" />
            </span>
            {t('dynamic.custom_stages.add', { defaultValue: 'Agregar etapa' })}
        </button>
    )
}

// ---------------------------------------------------------------------------
// Lane context menu (Editar / Eliminar) for custom lanes
// ---------------------------------------------------------------------------

export interface CustomStageLaneMenuProps {
    stage: CustomStage
    onEdit: (stage: CustomStage) => void
    onDelete: (stage: CustomStage) => void
}

/** The ⋮ menu shown in a custom lane's header. */
export function CustomStageLaneMenu({
    stage,
    onEdit,
    onDelete,
}: CustomStageLaneMenuProps) {
    const { t } = useTranslation()
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={t('dynamic.custom_stages.menu', {
                        defaultValue: 'Opciones de la etapa',
                    })}
                    data-testid={`custom-stage-menu-${stage.key}`}
                >
                    <MoreVertical className="h-3.5 w-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(stage)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('dynamic.custom_stages.edit', { defaultValue: 'Editar' })}
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(stage)}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('dynamic.custom_stages.delete', { defaultValue: 'Eliminar' })}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

export interface CustomStageDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    model: string
    /** Columns for the smart-lane condition builder. */
    columns: ColumnDefinition[]
    /** Editing an existing stage, or null to create a new one. */
    initial: CustomStage | null
    /** Next board position for a newly created stage (appended at the end). */
    nextPosition: number
    onCreate: (draft: NewCustomStage) => Promise<void>
    onUpdate: (id: CustomStage['id'], patch: Partial<CustomStage>) => Promise<void>
}

export function CustomStageDialog({
    open,
    onOpenChange,
    model,
    columns,
    initial,
    nextPosition,
    onCreate,
    onUpdate,
}: CustomStageDialogProps) {
    const { t } = useTranslation()
    const isDark =
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
    const fieldChoices = useMemo(
        () => customStageFilterFields(columns),
        [columns],
    )

    const [label, setLabel] = useState('')
    const [color, setColor] = useState<string>(CUSTOM_STAGE_COLORS[0])
    const [type, setType] = useState<CustomStageType>('stage')
    const [filters, setFilters] = useState<CustomStageFilter[]>([])
    const [saving, setSaving] = useState(false)

    // Re-seed the form each time the dialog opens (create vs edit).
    useEffect(() => {
        if (!open) return
        if (initial) {
            setLabel(initial.label)
            setColor(initial.color || CUSTOM_STAGE_COLORS[0])
            setType(initial.type)
            setFilters(
                initial.filters?.length
                    ? initial.filters.map((f) => ({ ...f }))
                    : [emptyCustomStageFilter(fieldChoices[0]?.key ?? '')],
            )
        } else {
            setLabel('')
            setColor(CUSTOM_STAGE_COLORS[0])
            setType('stage')
            setFilters([emptyCustomStageFilter(fieldChoices[0]?.key ?? '')])
        }
    }, [open, initial, fieldChoices])

    const patchFilter = (i: number, patch: Partial<CustomStageFilter>) =>
        setFilters((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
        )
    const addFilter = () =>
        setFilters((prev) => [
            ...prev,
            emptyCustomStageFilter(fieldChoices[0]?.key ?? ''),
        ])
    const removeFilter = (i: number) =>
        setFilters((prev) => prev.filter((_, idx) => idx !== i))

    const valid = isCustomStageDraftValid({ label, type, filters })

    const submit = async () => {
        if (!valid || saving) return
        setSaving(true)
        // Only smart lanes carry filters; a normal stage sends an empty set.
        const cleanFilters =
            type === 'smart'
                ? filters.filter((f) => f.field && String(f.value).trim() !== '')
                : []
        try {
            if (initial) {
                await onUpdate(initial.id, {
                    label: label.trim(),
                    color,
                    type,
                    filters: cleanFilters,
                })
                toast.success(
                    t('dynamic.custom_stages.updated', {
                        defaultValue: 'Etapa actualizada',
                    }),
                )
            } else {
                await onCreate({
                    model,
                    key: slugifyStageKey(label),
                    label: label.trim(),
                    color,
                    position: nextPosition,
                    type,
                    filters: cleanFilters,
                    enabled: true,
                })
                toast.success(
                    t('dynamic.custom_stages.created', {
                        defaultValue: 'Etapa creada',
                    }),
                )
            }
            onOpenChange(false)
        } catch {
            // toast already surfaced by the hook; keep the draft open.
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {initial
                            ? t('dynamic.custom_stages.edit_title', {
                                  defaultValue: 'Editar etapa',
                              })
                            : t('dynamic.custom_stages.new_title', {
                                  defaultValue: 'Nueva etapa',
                              })}
                    </DialogTitle>
                    <DialogDescription>
                        {t('dynamic.custom_stages.dialog_description', {
                            defaultValue:
                                'Agrega una columna al tablero. Una etapa normal recibe tarjetas al arrastrarlas; una etapa inteligente muestra las tarjetas que cumplen condiciones.',
                        })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.custom_stages.name_label', {
                                defaultValue: 'Nombre',
                            })}
                        </Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('dynamic.custom_stages.name_placeholder', {
                                defaultValue: 'Nombre de la etapa',
                            })}
                            data-testid="custom-stage-name"
                            autoFocus
                        />
                    </div>

                    {/* Color palette */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.custom_stages.color_label', {
                                defaultValue: 'Color',
                            })}
                        </Label>
                        <div className="flex flex-wrap gap-1.5" data-testid="custom-stage-colors">
                            {CUSTOM_STAGE_COLORS.map((c) => {
                                const style = generateBadgeStyles(c, { isDark })
                                const selected = c === color
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setColor(c)}
                                        className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${
                                            selected
                                                ? 'border-foreground'
                                                : 'border-transparent'
                                        }`}
                                        style={{
                                            backgroundColor:
                                                style.backgroundColor ||
                                                (style as any).background,
                                        }}
                                        aria-label={c}
                                        aria-pressed={selected}
                                        data-testid={`custom-stage-color-${c}`}
                                    />
                                )
                            })}
                        </div>
                    </div>

                    {/* Type */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.custom_stages.type_label', {
                                defaultValue: 'Tipo',
                            })}
                        </Label>
                        <Select
                            value={type}
                            onValueChange={(v) => setType(v as CustomStageType)}
                        >
                            <SelectTrigger data-testid="custom-stage-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="stage">
                                    {t('dynamic.custom_stages.type_stage', {
                                        defaultValue: 'Etapa normal',
                                    })}
                                </SelectItem>
                                <SelectItem value="smart">
                                    {t('dynamic.custom_stages.type_smart', {
                                        defaultValue: 'Etapa inteligente',
                                    })}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Condition builder — smart lanes only */}
                    {type === 'smart' && (
                        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Filter className="h-3.5 w-3.5" />
                                {t('dynamic.custom_stages.conditions_label', {
                                    defaultValue: 'Condiciones',
                                })}
                            </div>
                            {filters.map((f, i) => (
                                <div
                                    key={i}
                                    className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5"
                                    data-testid={`custom-stage-condition-${i}`}
                                >
                                    <Select
                                        value={f.field}
                                        onValueChange={(v) => patchFilter(i, { field: v })}
                                    >
                                        <SelectTrigger className="h-8 text-xs" data-testid={`custom-stage-condition-field-${i}`}>
                                            <SelectValue
                                                placeholder={t(
                                                    'dynamic.custom_stages.field_placeholder',
                                                    { defaultValue: 'Campo' },
                                                )}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {fieldChoices.map((c) => (
                                                <SelectItem key={c.key} value={c.key} className="text-xs">
                                                    {t(c.label, { defaultValue: c.label })}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={f.op}
                                        onValueChange={(v) =>
                                            patchFilter(i, { op: v as CustomStageFilterOp })
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-[104px] text-xs" data-testid={`custom-stage-condition-op-${i}`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CUSTOM_STAGE_FILTER_OPS.map((op) => (
                                                <SelectItem key={op} value={op} className="text-xs">
                                                    {t(`dynamic.custom_stages.op.${op}`, {
                                                        defaultValue:
                                                            op === 'eq'
                                                                ? 'es igual'
                                                                : op === 'neq'
                                                                ? 'distinto'
                                                                : op === 'contains'
                                                                ? 'contiene'
                                                                : 'en lista',
                                                    })}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={f.value}
                                        onChange={(e) => patchFilter(i, { value: e.target.value })}
                                        placeholder={t('dynamic.custom_stages.value_placeholder', {
                                            defaultValue: 'Valor',
                                        })}
                                        className="h-8 text-xs"
                                        data-testid={`custom-stage-condition-value-${i}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeFilter(i)}
                                        disabled={filters.length === 1}
                                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40"
                                        aria-label={t('dynamic.custom_stages.remove_condition', {
                                            defaultValue: 'Quitar condición',
                                        })}
                                        data-testid={`custom-stage-condition-remove-${i}`}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 justify-start gap-1 text-xs"
                                onClick={addFilter}
                                data-testid="custom-stage-add-condition"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('dynamic.custom_stages.add_condition', {
                                    defaultValue: 'Agregar condición',
                                })}
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        {t('dynamic.custom_stages.cancel', { defaultValue: 'Cancelar' })}
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        disabled={!valid || saving}
                        data-testid="custom-stage-save"
                    >
                        {initial
                            ? t('dynamic.custom_stages.save', { defaultValue: 'Guardar' })
                            : t('dynamic.custom_stages.create', { defaultValue: 'Crear etapa' })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

export interface CustomStageDeleteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    stage: CustomStage | null
    onConfirm: (stage: CustomStage) => Promise<void>
}

/**
 * Confirms deleting a custom lane. A 409 (the backend rejected because cards
 * still sit on the stage) doesn't close the dialog — it surfaces a targeted
 * message so the user can move the cards out first.
 */
export function CustomStageDeleteDialog({
    open,
    onOpenChange,
    stage,
    onConfirm,
}: CustomStageDeleteDialogProps) {
    const { t } = useTranslation()
    const [busy, setBusy] = useState(false)
    const [conflict, setConflict] = useState(false)

    useEffect(() => {
        if (open) setConflict(false)
    }, [open])

    if (!stage) return null

    const confirm = async () => {
        setBusy(true)
        setConflict(false)
        try {
            await onConfirm(stage)
            toast.success(
                t('dynamic.custom_stages.deleted', {
                    defaultValue: 'Etapa eliminada',
                }),
            )
            onOpenChange(false)
        } catch (e: any) {
            if (e?.response?.status === 409) {
                // Cards still on the stage — keep the dialog open with guidance.
                setConflict(true)
            } else {
                onOpenChange(false)
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('dynamic.custom_stages.delete_title', {
                            defaultValue: 'Eliminar etapa',
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {conflict
                            ? t('dynamic.custom_stages.delete_conflict', {
                                  defaultValue:
                                      'La etapa tiene tarjetas. Muévelas a otra columna antes de eliminarla.',
                              })
                            : t('dynamic.custom_stages.delete_confirm', {
                                  defaultValue:
                                      '¿Eliminar la etapa "{{label}}"? Esta acción no se puede deshacer.',
                                  label: t(stage.label, { defaultValue: stage.label }),
                              })}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        {t('dynamic.custom_stages.cancel', { defaultValue: 'Cancelar' })}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => void confirm()}
                        disabled={busy || conflict}
                        data-testid="custom-stage-delete-confirm"
                    >
                        {t('dynamic.custom_stages.delete', { defaultValue: 'Eliminar' })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------
// Smart (virtual) lane — fetches its own records from the model's list
// ---------------------------------------------------------------------------

export interface SmartLaneProps {
    stage: CustomStage
    model: string
    /** Org-scoped list endpoint base (same as the kanban's). */
    endpoint?: string
    /** Board-wide static filters always applied (never shown as a chip). */
    defaultFilters?: Record<string, any>
    pageSize?: number
    isDark: boolean
    /** Renders one card the same way the board's real lanes do (read-only). */
    renderCard: (card: any) => React.ReactNode
    /** Refetch trigger — bump to re-run the lane's query. */
    refreshTrigger?: any
    onEdit: (stage: CustomStage) => void
    onDelete: (stage: CustomStage) => void
}

/**
 * A virtual lane defined by `filters`. It runs its OWN list query (the board's
 * shared records don't include it), so it stays correct regardless of what the
 * main board page loaded. Cards render read-only — a smart lane is a saved view,
 * not a drop target — and the header carries a funnel glyph + the custom menu.
 */
export function SmartLane({
    stage,
    model,
    endpoint,
    defaultFilters,
    pageSize = 50,
    isDark,
    renderCard,
    refreshTrigger,
    onEdit,
    onDelete,
}: SmartLaneProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [records, setRecords] = useState<any[]>([])
    const [total, setTotal] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    const params = useMemo(
        () => smartLaneParams(stage.filters),
        [stage.filters],
    )

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        api
            .get(endpoint || `/data/${model}`, {
                params: {
                    page: 1,
                    per_page: pageSize,
                    ...defaultFilters,
                    ...params,
                },
            })
            .then((res: { data: ApiResponse<any[]> & { meta?: any } }) => {
                if (cancelled) return
                if (res.data.success) setRecords(res.data.data || [])
                setTotal(res.data.meta?.total ?? res.data.meta?.count ?? null)
            })
            .catch(() => {
                if (!cancelled) setRecords([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, endpoint, model, pageSize, JSON.stringify(params), JSON.stringify(defaultFilters ?? {}), refreshTrigger])

    const headerStyle = generateBadgeStyles(stage.color || optionColor(stage.key), {
        isDark,
    })
    const count = total ?? records.length

    return (
        <div
            className="flex min-w-[280px] max-w-[420px] flex-1 shrink-0 flex-col rounded-xl border border-dashed bg-muted/20"
            data-smart-stage={stage.key}
            data-testid={`smart-lane-${stage.key}`}
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                    <Badge
                        variant="outline"
                        className="border-0 text-xs font-semibold"
                        style={headerStyle}
                    >
                        {t(stage.label, { defaultValue: stage.label })}
                    </Badge>
                    <span
                        className="text-muted-foreground"
                        title={t('dynamic.custom_stages.smart_hint', {
                            defaultValue: 'Etapa inteligente (por condiciones)',
                        })}
                    >
                        <Filter className="h-3 w-3" />
                    </span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {count}
                    </span>
                </div>
                <CustomStageLaneMenu
                    stage={stage}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            </div>
            <div className="flex min-h-[55vh] max-h-[70vh] min-w-0 flex-col gap-2 overflow-y-auto px-2 pb-3">
                {loading && records.length === 0 ? (
                    <>
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </>
                ) : records.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                        {t('dynamic.custom_stages.smart_empty', {
                            defaultValue: 'Sin tarjetas que cumplan las condiciones',
                        })}
                    </p>
                ) : (
                    records.map((card) => (
                        <React.Fragment key={String(card.id)}>
                            {renderCard(card)}
                        </React.Fragment>
                    ))
                )}
            </div>
        </div>
    )
}

// Re-export the api client type so hosts can see the transport contract.
export type { ApiClient }
