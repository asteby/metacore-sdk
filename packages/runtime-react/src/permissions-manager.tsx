// permissions-manager — "Permisos y Roles" pro view (rol × módulo × acción).
//
// Transport-agnostic: every read/write arrives via props (loaders/mutators),
// so each host wires them to its own api client (ops → /api/permissions/*).
// The capability universe (modules × actions + general flags) is derived from
// the installed manifests server-side; this component only renders it.
//
// Layout (mirrors the app sidebar so admins recognise what they grant):
//   header   — title + "Nuevo rol" (primary) + "Guardar permisos" (green).
//   left     — Card "Rol": clean role combobox with inline Editar/Eliminar
//              icons (no removable chip) + "Permisos Generales" flags.
//            — Card "Módulos": a searchable, accordion *tree* grouped by
//              `addon_label` (modules without one → "Sistema"). Each group
//              lists its modules with their icon + a granted-count badge.
//              Clicking a module selects it and reveals its action grid.
//   right    — Card "Acciones permitidas": granted counter N/M, mark-all /
//              clear, checkbox grid (icon + label per action). Clear empty
//              states for "pick a role" / "pick a module" / loading.
//
// Saving calls `syncRolePermissions(roleId, capabilities)` with the FULL
// granted set of the active role (baseline + the edits made here). Dirty
// state is tracked against the loaded baseline and surfaced next to the
// save button.
import * as React from 'react'
import {
    Check,
    ChevronRight,
    ChevronsUpDown,
    CheckCheck,
    Eraser,
    Folder,
    Pencil,
    Plus,
    Save,
    Search,
    Shield,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@asteby/metacore-ui/lib'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Separator,
    Skeleton,
} from '@asteby/metacore-ui/primitives'
import { DynamicIcon } from './dynamic-icon'

// ---------------------------------------------------------------------------
// Types (mirror of `GET /api/permissions/modules` / `/api/permissions/roles`)
// ---------------------------------------------------------------------------

export interface PermissionActionDef {
    /** Canonical action key (`index`, `create`, …, or a custom key like `pagar`). */
    key: string
    /** Localized label ("Listar", "Pagar"). */
    label: string
    /** Lucide icon name from the manifest action (optional). */
    icon?: string
    /** `crud` for the derived CRUD set, `custom` for manifest actions. */
    kind?: 'crud' | 'custom' | string
}

export interface PermissionModuleDef {
    /** Module key = lowercase model table (`pos_orders`). */
    key: string
    /** Localized module label ("Pedidos POS"). */
    label: string
    /** Module icon (lucide name) — mirrors the sidebar entry. */
    icon?: string
    /** Owning addon key (`pos`). */
    addon_key?: string
    /** Localized addon label ("Punto de venta") — used to group the tree. */
    addon_label?: string
    actions: PermissionActionDef[]
}

export interface GeneralPermissionDef {
    /** Full capability key (`general.work_after_hours`). */
    key: string
    label: string
    description?: string
}

export interface PermissionsCatalog {
    modules: PermissionModuleDef[]
    general: GeneralPermissionDef[]
}

export interface RoleDef {
    id: string
    /** Stable role key ("cashier"). */
    name: string
    /** Human label ("Cajero"). Falls back to `name` when omitted. */
    label?: string
    /** Accent color (hex) for the role chip. */
    color?: string
}

export interface RoleInput {
    name: string
    label?: string
    color?: string
}

export interface PermissionsManagerProps {
    /** Loads the module×action universe + general flags. */
    loadModules: () => Promise<PermissionsCatalog>
    /** Loads every assignable role. */
    loadRoles: () => Promise<RoleDef[]>
    /** Loads the capabilities currently granted to a role. */
    loadRolePermissions: (roleId: string) => Promise<string[]>
    /** Persists the FULL granted capability set of a role. */
    syncRolePermissions: (roleId: string, capabilities: string[]) => Promise<void>
    /** Optional role CRUD — omitting one hides its control. */
    createRole?: (input: RoleInput) => Promise<RoleDef | void>
    updateRole?: (roleId: string, input: RoleInput) => Promise<RoleDef | void>
    deleteRole?: (roleId: string) => Promise<void>
    /** Page heading. Defaults to "Permisos y Roles". */
    title?: string
    className?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for hosts/tests)
// ---------------------------------------------------------------------------

/** Capability for a catalog module action: `lowercase(moduleKey).actionKey`. */
export function moduleActionCapability(moduleKey: string, actionKey: string): string {
    return `${moduleKey.toLowerCase()}.${actionKey}`
}

/** All capabilities of one module. */
export function moduleCapabilities(module: PermissionModuleDef): string[] {
    return module.actions.map((a) => moduleActionCapability(module.key, a.key))
}

/** How many of the module's capabilities are in the granted set. */
export function grantedCountForModule(
    granted: ReadonlySet<string>,
    module: PermissionModuleDef,
): number {
    return moduleCapabilities(module).filter((c) => granted.has(c)).length
}

export function capabilitySetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
}

/** Default lucide icon when the manifest action doesn't declare one. */
export function defaultActionIcon(actionKey: string, kind?: string): string {
    switch (actionKey) {
        case 'index':
            return 'List'
        case 'create':
            return 'Plus'
        case 'update':
            return 'Pencil'
        case 'delete':
            return 'Trash2'
        case 'export':
            return 'Download'
        case 'import':
            return 'Upload'
        default:
            return kind === 'crud' ? 'List' : 'Zap'
    }
}

/** Group label fallback when a module has no addon ("Sistema" = core/infra). */
const SYSTEM_GROUP = 'Sistema'

function moduleGroupLabel(mod: PermissionModuleDef): string {
    return mod.addon_label || mod.addon_key || SYSTEM_GROUP
}

/** Accent-insensitive, lowercase fold for tree search. */
function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
}

function slugify(label: string): string {
    return fold(label)
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
}

const ROLE_COLORS = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#6b7280',
]

/** [groupLabel, modules] buckets in stable insertion order. */
export interface ModuleGroup {
    label: string
    modules: PermissionModuleDef[]
}

export function groupModules(modules: PermissionModuleDef[]): ModuleGroup[] {
    const order: string[] = []
    const byGroup = new Map<string, PermissionModuleDef[]>()
    for (const mod of modules) {
        const g = moduleGroupLabel(mod)
        if (!byGroup.has(g)) {
            byGroup.set(g, [])
            order.push(g)
        }
        byGroup.get(g)!.push(mod)
    }
    return order.map((label) => ({ label, modules: byGroup.get(label)! }))
}

/** Filter the grouped tree by a folded query against module + group labels. */
export function filterModuleGroups(groups: ModuleGroup[], query: string): ModuleGroup[] {
    const q = fold(query).trim()
    if (!q) return groups
    const out: ModuleGroup[] = []
    for (const g of groups) {
        const groupMatches = fold(g.label).includes(q)
        const mods = groupMatches
            ? g.modules
            : g.modules.filter(
                  (m) => fold(m.label).includes(q) || fold(m.key).includes(q),
              )
        if (mods.length) out.push({ label: g.label, modules: mods })
    }
    return out
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

/** Checkbox row used by both the action grid and the general flags. */
function CapabilityCheck({
    checked,
    disabled,
    onToggle,
    icon,
    label,
    description,
}: {
    checked: boolean
    disabled?: boolean
    onToggle: () => void
    icon?: string
    label: string
    description?: string
}) {
    return (
        <div
            role="checkbox"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onClick={disabled ? undefined : onToggle}
            onKeyDown={
                disabled
                    ? undefined
                    : (e: React.KeyboardEvent) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              onToggle()
                          }
                      }
            }
            className={cn(
                'flex items-start gap-2.5 rounded-md border border-border/60 bg-card px-3 py-2.5 text-sm transition-colors',
                disabled ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40',
                checked && 'border-primary/40 bg-primary/5',
            )}
        >
            <Checkbox
                checked={checked}
                aria-hidden="true"
                tabIndex={-1}
                className="pointer-events-none mt-0.5 shrink-0"
            />
            {icon && (
                <DynamicIcon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{label}</span>
                {description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                )}
            </span>
        </div>
    )
}

/** One module row inside the tree. */
function ModuleTreeItem({
    module,
    active,
    granted,
    total,
    onSelect,
}: {
    module: PermissionModuleDef
    active: boolean
    granted: number
    total: number
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={active || undefined}
            className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                active
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
        >
            <DynamicIcon
                name={module.icon || 'Square'}
                className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
            />
            <span className="min-w-0 flex-1 truncate">{module.label}</span>
            {granted > 0 && (
                <Badge
                    variant={granted === total ? 'default' : 'secondary'}
                    className="h-5 shrink-0 px-1.5 text-[10px] tabular-nums"
                >
                    {granted}/{total}
                </Badge>
            )}
        </button>
    )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PermissionsManager({
    loadModules,
    loadRoles,
    loadRolePermissions,
    syncRolePermissions,
    createRole,
    updateRole,
    deleteRole,
    title = 'Permisos y Roles',
    className,
}: PermissionsManagerProps) {
    const [catalog, setCatalog] = React.useState<PermissionsCatalog | null>(null)
    const [roles, setRoles] = React.useState<RoleDef[] | null>(null)
    const [loadError, setLoadError] = React.useState(false)

    const [activeRoleId, setActiveRoleId] = React.useState<string | null>(null)
    const [activeModuleKey, setActiveModuleKey] = React.useState<string | null>(null)

    // baseline = capabilities as persisted; draft = baseline + local edits.
    const [baseline, setBaseline] = React.useState<Set<string> | null>(null)
    const [draft, setDraft] = React.useState<Set<string> | null>(null)
    const [loadingPerms, setLoadingPerms] = React.useState(false)
    const [saving, setSaving] = React.useState(false)

    const [roleOpen, setRoleOpen] = React.useState(false)
    const [moduleQuery, setModuleQuery] = React.useState('')
    // Groups the user explicitly collapsed (default: every group open).
    const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())

    // Pending role switch while there are unsaved changes.
    const [pendingRoleId, setPendingRoleId] = React.useState<string | null>(null)

    const [roleDialog, setRoleDialog] = React.useState<{
        open: boolean
        mode: 'create' | 'edit'
        label: string
        color: string
    }>({ open: false, mode: 'create', label: '', color: ROLE_COLORS[5] })
    const [roleSaving, setRoleSaving] = React.useState(false)
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    const loading = catalog === null || roles === null

    // ---- initial load: catalog + roles in parallel -------------------------
    React.useEffect(() => {
        let cancelled = false
        Promise.all([loadModules(), loadRoles()])
            .then(([cat, rs]) => {
                if (cancelled) return
                setCatalog(cat)
                setRoles(rs)
                setActiveRoleId((prev) => prev ?? rs[0]?.id ?? null)
                setActiveModuleKey((prev) => prev ?? cat.modules[0]?.key ?? null)
            })
            .catch(() => {
                if (!cancelled) setLoadError(true)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ---- per-role permissions ----------------------------------------------
    React.useEffect(() => {
        if (!activeRoleId) {
            setBaseline(null)
            setDraft(null)
            return
        }
        let cancelled = false
        setLoadingPerms(true)
        loadRolePermissions(activeRoleId)
            .then((caps) => {
                if (cancelled) return
                setBaseline(new Set(caps))
                setDraft(new Set(caps))
            })
            .catch(() => {
                if (cancelled) return
                toast.error('No se pudieron cargar los permisos del rol')
                setBaseline(null)
                setDraft(null)
            })
            .finally(() => {
                if (!cancelled) setLoadingPerms(false)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRoleId])

    const activeRole = React.useMemo(
        () => roles?.find((r) => r.id === activeRoleId) ?? null,
        [roles, activeRoleId],
    )
    const activeModule = React.useMemo(
        () => catalog?.modules.find((m) => m.key === activeModuleKey) ?? null,
        [catalog, activeModuleKey],
    )

    const dirty = baseline !== null && draft !== null && !capabilitySetsEqual(baseline, draft)

    // Module tree: grouped by addon label, optionally filtered by the search.
    const allGroups = React.useMemo(() => groupModules(catalog?.modules ?? []), [catalog])
    const visibleGroups = React.useMemo(
        () => filterModuleGroups(allGroups, moduleQuery),
        [allGroups, moduleQuery],
    )
    const searching = moduleQuery.trim().length > 0

    // ---- capability edits ---------------------------------------------------
    const toggleCapability = React.useCallback((cap: string) => {
        setDraft((prev) => {
            if (!prev) return prev
            const next = new Set(prev)
            if (next.has(cap)) next.delete(cap)
            else next.add(cap)
            return next
        })
    }, [])

    const setModuleAll = React.useCallback(
        (on: boolean) => {
            if (!activeModule) return
            const caps = moduleCapabilities(activeModule)
            setDraft((prev) => {
                if (!prev) return prev
                const next = new Set(prev)
                for (const c of caps) {
                    if (on) next.add(c)
                    else next.delete(c)
                }
                return next
            })
        },
        [activeModule],
    )

    const handleSave = async () => {
        if (!activeRoleId || !draft) return
        setSaving(true)
        try {
            await syncRolePermissions(activeRoleId, Array.from(draft).sort())
            setBaseline(new Set(draft))
            toast.success('Permisos guardados')
        } catch {
            toast.error('No se pudieron guardar los permisos')
        } finally {
            setSaving(false)
        }
    }

    // ---- role switching (dirty guard) ---------------------------------------
    const requestRoleSwitch = (roleId: string | null) => {
        if (roleId === activeRoleId) return
        if (dirty) setPendingRoleId(roleId)
        else setActiveRoleId(roleId)
    }

    const toggleGroup = (label: string) =>
        setCollapsedGroups((prev) => {
            const next = new Set(prev)
            if (next.has(label)) next.delete(label)
            else next.add(label)
            return next
        })

    // ---- role CRUD -----------------------------------------------------------
    const refreshRoles = async (selectId?: string | null) => {
        const rs = await loadRoles()
        setRoles(rs)
        if (selectId !== undefined) setActiveRoleId(selectId)
        else if (activeRoleId && !rs.some((r) => r.id === activeRoleId))
            setActiveRoleId(rs[0]?.id ?? null)
        return rs
    }

    const handleRoleSubmit = async () => {
        const label = roleDialog.label.trim()
        if (!label) return
        setRoleSaving(true)
        try {
            if (roleDialog.mode === 'create' && createRole) {
                const created = await createRole({
                    name: slugify(label),
                    label,
                    color: roleDialog.color,
                })
                const rs = await loadRoles()
                setRoles(rs)
                const createdId =
                    (created && 'id' in created && created.id) ||
                    rs.find((r) => r.name === slugify(label))?.id ||
                    null
                if (createdId) setActiveRoleId(createdId)
                toast.success('Rol creado')
            } else if (roleDialog.mode === 'edit' && updateRole && activeRole) {
                await updateRole(activeRole.id, {
                    name: activeRole.name,
                    label,
                    color: roleDialog.color,
                })
                await refreshRoles(activeRole.id)
                toast.success('Rol actualizado')
            }
            setRoleDialog((d) => ({ ...d, open: false }))
        } catch {
            toast.error(
                roleDialog.mode === 'create' ? 'No se pudo crear el rol' : 'No se pudo actualizar el rol',
            )
        } finally {
            setRoleSaving(false)
        }
    }

    const handleDeleteRole = async () => {
        if (!deleteRole || !activeRole) return
        setDeleting(true)
        try {
            await deleteRole(activeRole.id)
            const rs = await loadRoles()
            setRoles(rs)
            setActiveRoleId(rs[0]?.id ?? null)
            toast.success('Rol eliminado')
            setDeleteOpen(false)
        } catch {
            toast.error('No se pudo eliminar el rol')
        } finally {
            setDeleting(false)
        }
    }

    const openEditRole = () => {
        if (!activeRole) return
        setRoleDialog({
            open: true,
            mode: 'edit',
            label: activeRole.label || activeRole.name,
            color: activeRole.color || ROLE_COLORS[5],
        })
    }

    // ---- derived for the right panel ----------------------------------------
    const moduleGranted = activeModule && draft ? grantedCountForModule(draft, activeModule) : 0
    const moduleTotal = activeModule?.actions.length ?? 0
    const checksDisabled = !activeRole || !draft || loadingPerms || saving

    // ---- render --------------------------------------------------------------
    if (loadError) {
        return (
            <div
                className={cn(
                    'flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground',
                    className,
                )}
            >
                <Shield className="h-8 w-8 opacity-40" />
                <p className="text-sm">No se pudo cargar el catálogo de permisos.</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-56" />
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-28" />
                        <Skeleton className="h-9 w-40" />
                    </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
                    <div className="flex flex-col gap-4">
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-80 w-full" />
                    </div>
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col gap-4', className)}>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                    <p className="text-sm text-muted-foreground">
                        Define qué puede hacer cada rol en cada módulo.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {dirty && (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            Cambios sin guardar
                        </Badge>
                    )}
                    {createRole && (
                        <Button
                            onClick={() =>
                                setRoleDialog({
                                    open: true,
                                    mode: 'create',
                                    label: '',
                                    color: ROLE_COLORS[5],
                                })
                            }
                        >
                            <Plus className="mr-1.5 h-4 w-4" /> Nuevo rol
                        </Button>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={!dirty || saving || !activeRole}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        <Save className="mr-1.5 h-4 w-4" />
                        {saving ? 'Guardando…' : 'Guardar permisos'}
                    </Button>
                </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
                {/* Left column */}
                <div className="flex flex-col gap-4">
                    {/* Card: Rol */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Rol</CardTitle>
                            <CardDescription>Selecciona el rol a configurar.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            {/* Clean role combobox with inline edit/delete. */}
                            <div className="flex items-center gap-1.5">
                                <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={roleOpen}
                                            className="min-w-0 flex-1 justify-between font-normal"
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                {activeRole && (
                                                    <span
                                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                        style={{
                                                            background: activeRole.color || '#6b7280',
                                                        }}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="truncate">
                                                    {activeRole
                                                        ? activeRole.label || activeRole.name
                                                        : 'Seleccionar rol…'}
                                                </span>
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[280px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Buscar rol…" />
                                            <CommandList>
                                                <CommandEmpty>Sin resultados.</CommandEmpty>
                                                <CommandGroup>
                                                    {(roles ?? []).map((role) => (
                                                        <CommandItem
                                                            key={role.id}
                                                            value={`${role.label || ''} ${role.name}`}
                                                            onSelect={() => {
                                                                requestRoleSwitch(role.id)
                                                                setRoleOpen(false)
                                                            }}
                                                        >
                                                            <span
                                                                className="mr-2 h-2 w-2 shrink-0 rounded-full"
                                                                style={{
                                                                    background: role.color || '#6b7280',
                                                                }}
                                                                aria-hidden="true"
                                                            />
                                                            <span className="truncate">
                                                                {role.label || role.name}
                                                            </span>
                                                            {role.id === activeRoleId && (
                                                                <Check className="ml-auto h-4 w-4" />
                                                            )}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {updateRole && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 shrink-0"
                                        aria-label="Editar rol"
                                        disabled={!activeRole}
                                        onClick={openEditRole}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                )}
                                {deleteRole && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                                        aria-label="Eliminar rol"
                                        disabled={!activeRole}
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            {(catalog?.general.length ?? 0) > 0 && (
                                <>
                                    <Separator />
                                    <div>
                                        <h3 className="mb-2 text-sm font-semibold">Permisos Generales</h3>
                                        <div className="flex flex-col gap-2">
                                            {catalog!.general.map((g) => (
                                                <CapabilityCheck
                                                    key={g.key}
                                                    checked={draft?.has(g.key) ?? false}
                                                    disabled={checksDisabled}
                                                    onToggle={() => toggleCapability(g.key)}
                                                    label={g.label}
                                                    description={g.description}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Card: Módulos (hierarchical tree, mirrors the sidebar) */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Módulos</CardTitle>
                            <CardDescription>
                                Elige el módulo cuyas acciones quieres configurar.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={moduleQuery}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                        setModuleQuery(e.target.value)
                                    }
                                    placeholder="Buscar módulo…"
                                    aria-label="Buscar módulo"
                                    className="pl-8"
                                />
                            </div>

                            <div
                                role="tree"
                                aria-label="Módulos"
                                className="-mx-1 max-h-[460px] overflow-y-auto px-1"
                            >
                                {visibleGroups.length === 0 ? (
                                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                        Sin módulos.
                                    </p>
                                ) : (
                                    visibleGroups.map((group) => {
                                        // While searching, force every matching group open.
                                        const open = searching || !collapsedGroups.has(group.label)
                                        return (
                                            <Collapsible
                                                key={group.label}
                                                open={open}
                                                onOpenChange={() =>
                                                    !searching && toggleGroup(group.label)
                                                }
                                            >
                                                <CollapsibleTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40"
                                                    >
                                                        <ChevronRight
                                                            className={cn(
                                                                'h-3.5 w-3.5 shrink-0 transition-transform',
                                                                open && 'rotate-90',
                                                            )}
                                                        />
                                                        <Folder className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="min-w-0 flex-1 truncate normal-case">
                                                            {group.label}
                                                        </span>
                                                        <span className="shrink-0 text-[10px] tabular-nums opacity-70">
                                                            {group.modules.length}
                                                        </span>
                                                    </button>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <div className="ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-1.5">
                                                        {group.modules.map((mod) => (
                                                            <ModuleTreeItem
                                                                key={mod.key}
                                                                module={mod}
                                                                active={mod.key === activeModuleKey}
                                                                granted={
                                                                    draft
                                                                        ? grantedCountForModule(
                                                                              draft,
                                                                              mod,
                                                                          )
                                                                        : 0
                                                                }
                                                                total={mod.actions.length}
                                                                onSelect={() =>
                                                                    setActiveModuleKey(mod.key)
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right column: Acciones permitidas */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    {activeModule && (
                                        <DynamicIcon
                                            name={activeModule.icon || 'Square'}
                                            className="h-4 w-4 shrink-0 text-primary"
                                        />
                                    )}
                                    <span className="truncate">
                                        {activeModule ? activeModule.label : 'Acciones permitidas'}
                                    </span>
                                </CardTitle>
                                <CardDescription>
                                    {activeModule
                                        ? `${moduleGroupLabel(activeModule)} · configura las acciones permitidas`
                                        : 'Configura los permisos del módulo seleccionado.'}
                                </CardDescription>
                            </div>
                            {activeRole && activeModule && (
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="tabular-nums">
                                        {moduleGranted}/{moduleTotal}
                                    </Badge>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8"
                                        disabled={checksDisabled || moduleGranted === moduleTotal}
                                        onClick={() => setModuleAll(true)}
                                    >
                                        <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Marcar todo
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8"
                                        disabled={checksDisabled || moduleGranted === 0}
                                        onClick={() => setModuleAll(false)}
                                    >
                                        <Eraser className="mr-1.5 h-3.5 w-3.5" /> Limpiar
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {!activeRole ? (
                            <EmptyHint text="Selecciona un rol para configurar sus permisos." />
                        ) : loadingPerms ? (
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton key={i} className="h-11 w-full" />
                                ))}
                            </div>
                        ) : !activeModule ? (
                            <EmptyHint text="Selecciona un módulo del árbol para ver sus acciones." />
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {activeModule.actions.map((action) => {
                                    const cap = moduleActionCapability(activeModule.key, action.key)
                                    return (
                                        <CapabilityCheck
                                            key={action.key}
                                            checked={draft?.has(cap) ?? false}
                                            disabled={checksDisabled}
                                            onToggle={() => toggleCapability(cap)}
                                            icon={action.icon || defaultActionIcon(action.key, action.kind)}
                                            label={action.label}
                                        />
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Dirty guard when switching roles */}
            <AlertDialog
                open={pendingRoleId !== null}
                onOpenChange={(open: boolean) => !open && setPendingRoleId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tienes cambios sin guardar en este rol. Si cambias de rol se descartarán.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setActiveRoleId(pendingRoleId)
                                setPendingRoleId(null)
                            }}
                        >
                            Descartar y cambiar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Role create/edit dialog */}
            <Dialog
                open={roleDialog.open}
                onOpenChange={(open: boolean) => setRoleDialog((d) => ({ ...d, open }))}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {roleDialog.mode === 'create' ? 'Nuevo rol' : 'Editar rol'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="pm-role-name">Nombre del rol</Label>
                            <Input
                                id="pm-role-name"
                                value={roleDialog.label}
                                placeholder="Ej. Cajero"
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setRoleDialog((d) => ({ ...d, label: e.target.value }))
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label>Color</Label>
                            <div className="flex flex-wrap gap-2">
                                {ROLE_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        aria-label={`Color ${c}`}
                                        onClick={() => setRoleDialog((d) => ({ ...d, color: c }))}
                                        className={cn(
                                            'h-7 w-7 rounded-full border-2 transition-transform',
                                            roleDialog.color === c
                                                ? 'scale-110 border-foreground'
                                                : 'border-transparent hover:scale-105',
                                        )}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRoleDialog((d) => ({ ...d, open: false }))}
                            disabled={roleSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleRoleSubmit}
                            disabled={roleSaving || !roleDialog.label.trim()}
                        >
                            {roleSaving
                                ? 'Guardando…'
                                : roleDialog.mode === 'create'
                                  ? 'Crear rol'
                                  : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Role delete confirm */}
            <AlertDialog
                open={deleteOpen}
                onOpenChange={(open: boolean) => !deleting && setDeleteOpen(open)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar el rol?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se eliminará el rol{' '}
                            <strong>{activeRole ? activeRole.label || activeRole.name : ''}</strong> y
                            sus asignaciones de permisos. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            disabled={deleting}
                            onClick={(e: React.MouseEvent) => {
                                e.preventDefault()
                                handleDeleteRole()
                            }}
                        >
                            {deleting ? 'Eliminando…' : 'Eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function EmptyHint({ text }: { text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Shield className="h-8 w-8 opacity-40" />
            <p className="text-sm">{text}</p>
        </div>
    )
}
