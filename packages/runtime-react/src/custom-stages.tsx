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
import { Plus, Trash2, Pencil, MoreVertical, Filter, Flag, GripVertical, Lock, RotateCcw, X } from 'lucide-react'
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
import type {
    ColumnDefinition,
    StageMeta,
    SmartLaneMeta,
    ApiResponse,
} from './types'

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
            custom: true,
            filters: cs.filters,
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
 * Serializes a smart lane's filters into the board's list query params. The ops
 * list endpoint (ops #704) takes a SINGLE `f_<field>` param whose value carries
 * the operator as a `OP:value` prefix:
 *   - eq       → `f_<field>=EQ:value`
 *   - neq      → `f_<field>=NEQ:value`
 *   - contains → `f_<field>=HAS:value` (membership in a jsonb array — NOT the
 *                text-substring ILIKE; that's why it's HAS, not CONTAINS)
 *   - in       → `f_<field>=IN:v1,v2,...` (comma-separated after `IN:`)
 * Empty fields/values are skipped.
 */
export function smartLaneParams(
    filters: { field: string; op: string; value: string }[] | undefined,
): Record<string, string> {
    const params: Record<string, string> = {}
    for (const f of filters ?? []) {
        if (!f.field || f.value == null || String(f.value).trim() === '') continue
        const v = String(f.value).trim()
        switch (f.op) {
            case 'neq':
                params[`f_${f.field}`] = `NEQ:${v}`
                break
            case 'contains':
                params[`f_${f.field}`] = `HAS:${v}`
                break
            case 'in':
                params[`f_${f.field}`] = `IN:${v}`
                break
            case 'eq':
            default:
                params[`f_${f.field}`] = `EQ:${v}`
        }
    }
    return params
}

/**
 * Resolves the smart lanes to paint. The kernel's `metadata.smart_lanes` is the
 * source of truth for rendering (ops #704); the CRUD list only backs the
 * management dialog. So when metadata carries smart lanes we map those, folding
 * in the CRUD entry's `id` (matched by key) so the Editar menu can PUT/DELETE.
 * When metadata omits them (older host / metadata lag) we tolerate the gap and
 * fall back to the CRUD smart stages. Returns `CustomStage[]` either way.
 */
export function resolveSmartLanes(
    metaSmartLanes: SmartLaneMeta[] | undefined,
    crudSmartStages: CustomStage[],
    model: string,
): CustomStage[] {
    if (!metaSmartLanes?.length) return crudSmartStages
    const crudByKey = new Map(crudSmartStages.map((s) => [s.key, s]))
    return metaSmartLanes.map((lane, i) => {
        const match = crudByKey.get(lane.key)
        return {
            id: match?.id ?? lane.key,
            model,
            key: lane.key,
            label: lane.label,
            color: lane.color ?? match?.color ?? 'slate',
            position: lane.order ?? match?.position ?? i,
            type: 'smart',
            filters: (lane.filters ?? []).map((f) => ({
                field: f.field,
                op: f.op as CustomStageFilterOp,
                value: f.value,
            })),
            enabled: true,
        }
    })
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

/**
 * Whether a card passes a set of extra lane `filters` (the same conditions a
 * smart lane uses, layered on top of a real stage). Ops:
 *   - eq       → equal (string compare)
 *   - neq      → not equal
 *   - contains → the card's value (array or string) includes the value
 *   - in       → the card's value is one of the comma-separated candidates
 * Empty/absent filters pass. Pure — a client-side belt-and-suspenders over the
 * initial (unscoped) board page; the server scopes the per-lane top-up queries.
 */
export function cardMatchesStageFilters(
    card: any,
    filters: CustomStageFilter[] | undefined,
): boolean {
    if (!filters || filters.length === 0) return true
    return filters.every((f) => {
        if (!f.field || String(f.value ?? '').trim() === '') return true
        const target = String(f.value).trim()
        const raw = card?.[f.field]
        switch (f.op) {
            case 'neq':
                return String(raw ?? '') !== target
            case 'contains':
                if (Array.isArray(raw)) return raw.map(String).includes(target)
                return String(raw ?? '').includes(target)
            case 'in':
                return target
                    .split(',')
                    .map((s) => s.trim())
                    .includes(String(raw ?? ''))
            case 'eq':
            default:
                return String(raw ?? '') === target
        }
    })
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
    /**
     * Deletes a stage. Pass `reassignTo` (a target lane key) to move a real
     * stage's cards first. Throws on 409 (cards still present, no reassign) so
     * the caller can read `meta.cards` and offer a reassignment target.
     */
    remove: (id: CustomStage['id'], reassignTo?: string) => Promise<void>
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
        async (id: CustomStage['id'], reassignTo?: string) => {
            try {
                await api.delete(
                    `/custom-stages/${id}`,
                    reassignTo
                        ? { params: { reassign_to: reassignTo } }
                        : undefined,
                )
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
// Condition builder (field / operator / value rows) — shared by the smart-lane
// editor and the declared-stage config dialog.
// ---------------------------------------------------------------------------

export interface StageConditionBuilderProps {
    /** The current filter rows. */
    filters: CustomStageFilter[]
    /** Called with the next filter rows on any add/remove/patch. */
    onChange: (filters: CustomStageFilter[]) => void
    /** Columns offered in the field dropdown (visible, non-id). */
    fieldChoices: ColumnDefinition[]
    /** Optional heading shown above the rows. */
    label?: string
}

/**
 * The reusable field/operator/value condition builder. Emits `CustomStageFilter[]`
 * through `onChange`. Same ops (eq/neq/contains/in) and testids the smart-lane
 * editor has always used, so it drops in for both the custom-stage smart lane
 * and the declared-stage config dialog.
 */
export function StageConditionBuilder({
    filters,
    onChange,
    fieldChoices,
    label,
}: StageConditionBuilderProps) {
    const { t } = useTranslation()
    const patchFilter = (i: number, patch: Partial<CustomStageFilter>) =>
        onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
    const addFilter = () =>
        onChange([...filters, emptyCustomStageFilter(fieldChoices[0]?.key ?? '')])
    const removeFilter = (i: number) =>
        onChange(filters.filter((_, idx) => idx !== i))
    return (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                {label ??
                    t('dynamic.custom_stages.conditions_label', {
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
                // PUT only accepts label/color/position/filters/enabled — model,
                // type and key are immutable (ops #704), so we never send them.
                await onUpdate(initial.id, {
                    label: label.trim(),
                    color,
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
                            disabled={!!initial}
                        >
                            <SelectTrigger
                                data-testid="custom-stage-type"
                                disabled={!!initial}
                            >
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
                        <StageConditionBuilder
                            filters={filters}
                            onChange={setFilters}
                            fieldChoices={fieldChoices}
                        />
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
    /** Other lanes a real stage's cards can be reassigned to (key excluded). */
    reassignTargets?: { key: string; label: string }[]
    /** `reassignTo` is set on retry after a 409 (real stage with cards). */
    onConfirm: (stage: CustomStage, reassignTo?: string) => Promise<void>
}

/**
 * Confirms deleting a custom lane. A 409 (the backend rejected because cards
 * still sit on a real stage) doesn't close the dialog — it reads `meta.cards`
 * from the response, shows the count, and offers a target lane to reassign the
 * cards to; confirming again retries the delete with `reassign_to`.
 */
export function CustomStageDeleteDialog({
    open,
    onOpenChange,
    stage,
    reassignTargets = [],
    onConfirm,
}: CustomStageDeleteDialogProps) {
    const { t } = useTranslation()
    const [busy, setBusy] = useState(false)
    const [conflict, setConflict] = useState(false)
    const [cardCount, setCardCount] = useState<number | null>(null)
    const [reassignTo, setReassignTo] = useState<string>('')

    useEffect(() => {
        if (open) {
            setConflict(false)
            setCardCount(null)
            setReassignTo('')
        }
    }, [open])

    if (!stage) return null

    const targets = reassignTargets.filter((tg) => tg.key !== stage.key)

    const confirm = async () => {
        // In conflict mode the delete only proceeds once a target is chosen.
        if (conflict && !reassignTo) return
        setBusy(true)
        try {
            await onConfirm(stage, conflict ? reassignTo : undefined)
            toast.success(
                t('dynamic.custom_stages.deleted', {
                    defaultValue: 'Etapa eliminada',
                }),
            )
            onOpenChange(false)
        } catch (e: any) {
            if (e?.response?.status === 409) {
                // Cards still on the stage — surface the count and let the user
                // pick a lane to move them to, then retry with reassign_to.
                setCardCount(e?.response?.data?.meta?.cards ?? null)
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
                                      'La etapa tiene {{count}} tarjeta(s). Elige a qué columna moverlas antes de eliminarla.',
                                  count: cardCount ?? 0,
                              })
                            : t('dynamic.custom_stages.delete_confirm', {
                                  defaultValue:
                                      '¿Eliminar la etapa "{{label}}"? Esta acción no se puede deshacer.',
                                  label: t(stage.label, { defaultValue: stage.label }),
                              })}
                    </DialogDescription>
                </DialogHeader>

                {conflict && (
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.custom_stages.reassign_label', {
                                defaultValue: 'Mover tarjetas a',
                            })}
                        </Label>
                        <Select value={reassignTo} onValueChange={setReassignTo}>
                            <SelectTrigger data-testid="custom-stage-reassign">
                                <SelectValue
                                    placeholder={t(
                                        'dynamic.custom_stages.reassign_placeholder',
                                        { defaultValue: 'Elige una columna' },
                                    )}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {targets.map((tg) => (
                                    <SelectItem key={tg.key} value={tg.key}>
                                        {t(tg.label, { defaultValue: tg.label })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

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
                        disabled={busy || (conflict && !reassignTo)}
                        data-testid="custom-stage-delete-confirm"
                    >
                        {conflict
                            ? t('dynamic.custom_stages.reassign_and_delete', {
                                  defaultValue: 'Mover y eliminar',
                              })
                            : t('dynamic.custom_stages.delete', {
                                  defaultValue: 'Eliminar',
                              })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ---------------------------------------------------------------------------
// Stage config dialog (the per-lane gear ⚙) — unifies DECLARED-lane overrides
// and CUSTOM real-stage editing behind one "Configurar etapa" UI.
// ---------------------------------------------------------------------------

export type StageConfigKind = 'declared' | 'custom'

/** What the gear opens the config dialog against — a declared or custom lane. */
export interface StageConfigTarget {
    kind: StageConfigKind
    /** Stable lane key. */
    stageKey: string
    /** Custom-stage id — required (and only used) when `kind === 'custom'`. */
    id?: CustomStage['id']
    label: string
    color: string
    filters: CustomStageFilter[]
    /**
     * Declared kind: an override is currently applied → shows a "Personalizada"
     * badge + "Restablecer al original". Ignored for custom stages (they reset
     * via their own delete flow).
     */
    overridden?: boolean
    /** Terminal stage (e.g. "Done") — surfaces an "Etapa final" chip + tooltip. */
    isFinal?: boolean
    /**
     * The manifest ORIGINAL (pre-override) values, when the host serves them
     * (`metadata.stages[].original`). Drives the "Restablecer al original" confirm
     * so the user sees exactly what reverts. Absent → a generic confirm.
     */
    original?: {
        label?: string
        color?: string
        filters?: CustomStageFilter[]
    }
    /** The backing CustomStage (custom kind) so "Eliminar" can trigger delete. */
    customStage?: CustomStage
}

/** A legible operator glyph for a condition chip: = / ≠ / contiene / en. */
export function stageFilterOpSymbol(op: string): string {
    switch (op) {
        case 'neq':
            return '≠'
        case 'contains':
            return 'contiene'
        case 'in':
            return 'en'
        case 'eq':
        default:
            return '='
    }
}

export interface StageConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Columns for the condition builder. */
    columns: ColumnDefinition[]
    /** The lane being configured, or null. */
    target: StageConfigTarget | null
    /** Declared: upsert the lane override (PUT /stage-overrides). */
    onSaveOverride: (
        stageKey: string,
        patch: { label: string; color: string; filters: CustomStageFilter[] },
    ) => Promise<void>
    /** Declared: reset the lane to its manifest default (DELETE /stage-overrides). */
    onResetOverride: (stageKey: string) => Promise<void>
    /** Custom: update the stage via its own CRUD (PUT /custom-stages/:id). */
    onUpdateCustom: (
        id: CustomStage['id'],
        patch: Partial<CustomStage>,
    ) => Promise<void>
    /** Custom: hand off to the existing delete (reassign) flow. */
    onDeleteCustom: (stage: CustomStage) => void
}

/**
 * The gear (⚙) dialog. Renames, recolors and attaches extra CONDITIONS to a
 * lane. One UI, two backends: a DECLARED lane persists through `/stage-overrides`
 * (with a "Restablecer etapa" that drops the override); a CUSTOM real stage
 * persists through its own `/custom-stages` CRUD (and deletes via that flow). The
 * conditions narrow which cards the lane shows/counts but never stop it being a
 * drop target — dropping a card only sets the stage value.
 */
export function StageConfigDialog({
    open,
    onOpenChange,
    columns,
    target,
    onSaveOverride,
    onResetOverride,
    onUpdateCustom,
    onDeleteCustom,
}: StageConfigDialogProps) {
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
    const [filters, setFilters] = useState<CustomStageFilter[]>([])
    const [saving, setSaving] = useState(false)
    const [resetting, setResetting] = useState(false)
    // Two-step reset: the first click reveals a confirm panel listing exactly
    // what reverts (the manifest original), the second actually drops the override.
    const [confirmingReset, setConfirmingReset] = useState(false)

    // Re-seed the WHOLE form from the lane's current (already-override-applied)
    // metadata each time the dialog opens — the user always sees the live state,
    // never a blank form. Label, color and every extra condition pre-fill editable.
    useEffect(() => {
        if (!open || !target) return
        setLabel(target.label)
        setColor(target.color || CUSTOM_STAGE_COLORS[0])
        setFilters(target.filters?.map((f) => ({ ...f })) ?? [])
        setConfirmingReset(false)
    }, [open, target])

    if (!target) return null

    const valid = label.trim().length > 0
    // Only complete conditions are persisted; empty rows are dropped.
    const cleanFilters = () =>
        filters.filter((f) => f.field && String(f.value).trim() !== '')
    // The conditions that make up the lane's EFFECTIVE query, for the chip row:
    // the immovable stage scope first, then each extra (removable) condition.
    const chipFilters = filters.filter(
        (f) => f.field && String(f.value).trim() !== '',
    )

    const removeFilterAt = (i: number) =>
        setFilters((prev) => prev.filter((_, idx) => idx !== i))

    const submit = async () => {
        if (!valid || saving) return
        setSaving(true)
        try {
            if (target.kind === 'declared') {
                await onSaveOverride(target.stageKey, {
                    label: label.trim(),
                    color,
                    filters: cleanFilters(),
                })
            } else if (target.id != null) {
                await onUpdateCustom(target.id, {
                    label: label.trim(),
                    color,
                    filters: cleanFilters(),
                })
            }
            toast.success(
                t('dynamic.stage_config.saved', {
                    defaultValue: 'Etapa configurada',
                }),
            )
            onOpenChange(false)
        } catch {
            // toast already surfaced by the caller's hook; keep the draft open.
        } finally {
            setSaving(false)
        }
    }

    const reset = async () => {
        if (resetting) return
        setResetting(true)
        try {
            await onResetOverride(target.stageKey)
            toast.success(
                t('dynamic.stage_config.reset_done', {
                    defaultValue: 'Etapa restablecida',
                }),
            )
            onOpenChange(false)
        } catch {
            toast.error(
                t('dynamic.stage_config.reset_error', {
                    defaultValue: 'No se pudo restablecer la etapa',
                }),
            )
        } finally {
            setResetting(false)
        }
    }

    const headerDot = generateBadgeStyles(
        color || optionColor(target.stageKey),
        { isDark },
    )
    // A one-line, human summary of the manifest original (for the reset confirm).
    const original = target.original
    const originalConditions =
        original?.filters && original.filters.length > 0
            ? original.filters
                  .map(
                      (f) =>
                          `${f.field} ${stageFilterOpSymbol(f.op)} ${f.value}`,
                  )
                  .join(', ')
            : t('dynamic.stage_config.original_no_conditions', {
                  defaultValue: 'sin condiciones',
              })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span
                            className="inline-block size-3 shrink-0 rounded-full"
                            style={{
                                backgroundColor:
                                    headerDot.backgroundColor ||
                                    (headerDot as any).background,
                            }}
                            aria-hidden
                        />
                        {t('dynamic.stage_config.title', {
                            defaultValue: 'Configurar etapa',
                        })}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                            {target.stageKey}
                        </code>
                        {target.kind === 'declared' && target.overridden && (
                            <Badge
                                variant="secondary"
                                className="ml-auto text-[10px] font-medium"
                                data-testid="stage-config-personalizada"
                            >
                                {t('dynamic.stage_config.customized', {
                                    defaultValue: 'Personalizada',
                                })}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {t('dynamic.stage_config.description', {
                            defaultValue:
                                'Renombra la columna, cambia su color y agrega condiciones para acotar qué tarjetas muestra y cuenta.',
                        })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {/* "Condiciones actuales" — the lane's EFFECTIVE query as chips.
                        The base "Etapa = <label>" chip is always present, locked and
                        dimmed (it's the stage scope, never removable); the terminal
                        chip appears for a final stage; each extra condition is an
                        editable/removable chip mirroring the builder below. */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t('dynamic.stage_config.current_conditions_label', {
                                defaultValue: 'Condiciones actuales',
                            })}
                        </Label>
                        <div
                            className="flex flex-wrap items-center gap-1.5"
                            data-testid="stage-config-current-conditions"
                        >
                            <Badge
                                variant="outline"
                                className="cursor-default gap-1 border-dashed text-[11px] font-normal text-muted-foreground opacity-80"
                                title={t('dynamic.stage_config.base_chip_hint', {
                                    defaultValue:
                                        'Alcance base de la etapa: no se puede quitar.',
                                })}
                                data-testid="stage-config-base-chip"
                            >
                                <Lock className="h-3 w-3" />
                                {t('dynamic.stage_config.base_chip', {
                                    defaultValue: 'Etapa = {{label}}',
                                    label: label || target.label,
                                })}
                            </Badge>
                            {target.isFinal && (
                                <Badge
                                    variant="outline"
                                    className="cursor-default gap-1 text-[11px] font-normal text-muted-foreground"
                                    title={t('dynamic.stage_config.final_chip_hint', {
                                        defaultValue:
                                            'Etapa terminal: al mover una tarjeta aquí se marca como cerrada (p. ej. en GitHub cierra el issue).',
                                    })}
                                    data-testid="stage-config-final-chip"
                                >
                                    <Flag className="h-3 w-3" />
                                    {t('dynamic.stage_config.final_chip', {
                                        defaultValue: 'Etapa final',
                                    })}
                                </Badge>
                            )}
                            {chipFilters.map((f) => {
                                // Chip index maps back to its position in `filters`.
                                const i = filters.indexOf(f)
                                return (
                                    <Badge
                                        key={i}
                                        variant="secondary"
                                        className="gap-1 pr-1 text-[11px] font-normal"
                                        data-testid={`stage-config-filter-chip-${i}`}
                                    >
                                        <span className="font-mono">{f.field}</span>
                                        <span className="opacity-70">
                                            {stageFilterOpSymbol(f.op)}
                                        </span>
                                        <span>{f.value}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeFilterAt(i)}
                                            className="ml-0.5 rounded p-0.5 hover:bg-background/60"
                                            aria-label={t(
                                                'dynamic.stage_config.remove_chip',
                                                { defaultValue: 'Quitar condición' },
                                            )}
                                            data-testid={`stage-config-filter-chip-remove-${i}`}
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </Badge>
                                )
                            })}
                        </div>
                    </div>

                    <div className="border-t" />

                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.stage_config.name_label', {
                                defaultValue: 'Nombre',
                            })}
                        </Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t('dynamic.stage_config.name_placeholder', {
                                defaultValue: 'Nombre de la etapa',
                            })}
                            data-testid="stage-config-name"
                            autoFocus
                        />
                    </div>

                    {/* Color palette */}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">
                            {t('dynamic.stage_config.color_label', {
                                defaultValue: 'Color',
                            })}
                        </Label>
                        <div className="flex flex-wrap gap-1.5" data-testid="stage-config-colors">
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
                                        data-testid={`stage-config-color-${c}`}
                                    />
                                )
                            })}
                        </div>
                    </div>

                    {/* Conditions — the editable builder (pre-filled from the lane) */}
                    <StageConditionBuilder
                        filters={filters}
                        onChange={setFilters}
                        fieldChoices={fieldChoices}
                        label={t('dynamic.stage_config.conditions_label', {
                            defaultValue: 'Condiciones (opcional)',
                        })}
                    />
                    {filters.length === 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="-mt-2 h-7 justify-start gap-1 text-xs"
                            onClick={() =>
                                setFilters([
                                    emptyCustomStageFilter(fieldChoices[0]?.key ?? ''),
                                ])
                            }
                            data-testid="stage-config-add-first-condition"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t('dynamic.stage_config.add_condition', {
                                defaultValue: 'Agregar condición',
                            })}
                        </Button>
                    )}

                    {/* Reset confirm — spells out exactly what reverts to the
                        manifest original before dropping the override. */}
                    {confirmingReset && (
                        <div
                            className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs"
                            data-testid="stage-config-reset-confirm-panel"
                        >
                            <p className="font-medium">
                                {t('dynamic.stage_config.reset_confirm_title', {
                                    defaultValue:
                                        'Se restablecerá la etapa a su versión original:',
                                })}
                            </p>
                            <ul className="list-inside list-disc text-muted-foreground">
                                <li>
                                    {t('dynamic.stage_config.reset_confirm_label', {
                                        defaultValue: 'Nombre: {{label}}',
                                        label: original?.label ?? target.stageKey,
                                    })}
                                </li>
                                <li>
                                    {t('dynamic.stage_config.reset_confirm_color', {
                                        defaultValue: 'Color: {{color}}',
                                        color: original?.color ?? '—',
                                    })}
                                </li>
                                <li>
                                    {t('dynamic.stage_config.reset_confirm_conditions', {
                                        defaultValue: 'Condiciones: {{list}}',
                                        list: originalConditions,
                                    })}
                                </li>
                            </ul>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirmingReset(false)}
                                    disabled={resetting}
                                >
                                    {t('dynamic.stage_config.cancel', {
                                        defaultValue: 'Cancelar',
                                    })}
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => void reset()}
                                    disabled={resetting}
                                    data-testid="stage-config-reset-confirm"
                                >
                                    {t('dynamic.stage_config.reset_confirm', {
                                        defaultValue: 'Restablecer al original',
                                    })}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    {/* Reset (declared+overridden) / delete (custom) on the left. */}
                    <div>
                        {target.kind === 'declared' && target.overridden && (
                            <Button
                                variant="ghost"
                                className="gap-1.5 text-muted-foreground"
                                onClick={() => setConfirmingReset(true)}
                                disabled={saving || resetting || confirmingReset}
                                data-testid="stage-config-reset"
                            >
                                <RotateCcw className="h-4 w-4" />
                                {t('dynamic.stage_config.reset', {
                                    defaultValue: 'Restablecer al original',
                                })}
                            </Button>
                        )}
                        {target.kind === 'custom' && target.customStage && (
                            <Button
                                variant="ghost"
                                className="gap-1.5 text-destructive hover:text-destructive"
                                onClick={() => {
                                    onOpenChange(false)
                                    onDeleteCustom(target.customStage!)
                                }}
                                disabled={saving}
                                data-testid="stage-config-delete"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t('dynamic.stage_config.delete', {
                                    defaultValue: 'Eliminar etapa',
                                })}
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving || resetting}
                        >
                            {t('dynamic.stage_config.cancel', {
                                defaultValue: 'Cancelar',
                            })}
                        </Button>
                        <Button
                            onClick={() => void submit()}
                            disabled={!valid || saving || resetting}
                            data-testid="stage-config-save"
                        >
                            {t('dynamic.stage_config.save', {
                                defaultValue: 'Guardar',
                            })}
                        </Button>
                    </div>
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
    /**
     * Optional drag-and-drop wiring (from the kanban's sortable wrapper) so a
     * smart lane can be reordered by its header like a real stage. Absent → the
     * lane is static.
     */
    dnd?: {
        setNodeRef: (el: HTMLElement | null) => void
        style?: React.CSSProperties
        isDragging?: boolean
        handleRef?: (el: HTMLElement | null) => void
        handleProps?: Record<string, any>
    }
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
    dnd,
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
            ref={dnd?.setNodeRef}
            className="group/lane flex min-w-[280px] max-w-[420px] flex-1 shrink-0 flex-col rounded-xl border border-dashed bg-muted/20"
            style={{ opacity: dnd?.isDragging ? 0.6 : 1, ...dnd?.style }}
            data-smart-stage={stage.key}
            data-testid={`smart-lane-${stage.key}`}
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div
                    ref={dnd ? dnd.handleRef : undefined}
                    {...(dnd ? dnd.handleProps : {})}
                    className={`flex min-w-0 items-center gap-1.5 ${
                        dnd ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                >
                    {dnd && (
                        <GripVertical
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover/lane:opacity-70"
                            aria-hidden
                        />
                    )}
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
