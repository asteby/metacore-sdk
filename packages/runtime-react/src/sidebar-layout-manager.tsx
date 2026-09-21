/**
 * SidebarLayoutManager — Discord-style org sidebar editor.
 * The canvas IS the sidebar: sections, folders, leaves — drag, rename, nest.
 */
import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Hash,
  Folder,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Input,
  ScrollArea,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import {
  collectFolderKeys,
  folderAccessCapability,
  layoutTreeFromNavGroups,
  leafRefFor,
  slugifyFolderKey,
  type CatalogLeaf,
  type SidebarLayoutDoc,
  type SidebarLayoutNode,
} from './apply-sidebar-layout'

export interface SidebarLayoutManagerProps {
  loadLayout: () => Promise<SidebarLayoutDoc>
  saveLayout: (doc: SidebarLayoutDoc) => Promise<void>
  resetLayout: () => Promise<void>
  catalog: CatalogLeaf[]
  currentGroups?: Array<{
    title: string
    items: Array<{
      title: string
      url: string
      icon?: string
      items?: Array<{ title: string; url: string; icon?: string }>
    }>
  }>
  /** Resolve i18n keys / raw titles to human labels. */
  resolveLabel?: (title: string) => string
  title?: string
  description?: string
}

type Path = number[]

function pathKey(path: Path): string {
  return path.length ? path.join('.') : 'root'
}

function getAt(tree: SidebarLayoutNode[], path: Path): SidebarLayoutNode | null {
  let cur: SidebarLayoutNode[] = tree
  let node: SidebarLayoutNode | null = null
  for (const i of path) {
    node = cur[i] ?? null
    if (!node) return null
    cur = node.children ?? []
  }
  return node
}

function setChildren(
  tree: SidebarLayoutNode[],
  parentPath: Path,
  children: SidebarLayoutNode[],
): SidebarLayoutNode[] {
  if (parentPath.length === 0) return children
  const clone = structuredClone(tree) as SidebarLayoutNode[]
  let cur: SidebarLayoutNode[] = clone
  for (let d = 0; d < parentPath.length - 1; d++) {
    const n = cur[parentPath[d]!]
    if (!n) return tree
    n.children = n.children ?? []
    cur = n.children
  }
  const parent = cur[parentPath[parentPath.length - 1]!]
  if (!parent) return tree
  parent.children = children
  return clone
}

function removeAt(tree: SidebarLayoutNode[], path: Path): {
  tree: SidebarLayoutNode[]
  node: SidebarLayoutNode | null
} {
  if (path.length === 0) return { tree, node: null }
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]!
  const parentKids =
    parentPath.length === 0
      ? [...tree]
      : [...(getAt(tree, parentPath)?.children ?? [])]
  const [node] = parentKids.splice(idx, 1)
  return { tree: setChildren(tree, parentPath, parentKids), node: node ?? null }
}

function insertAt(
  tree: SidebarLayoutNode[],
  parentPath: Path,
  index: number,
  node: SidebarLayoutNode,
): SidebarLayoutNode[] {
  const kids =
    parentPath.length === 0
      ? [...tree]
      : [...(getAt(tree, parentPath)?.children ?? [])]
  const i = Math.max(0, Math.min(index, kids.length))
  kids.splice(i, 0, node)
  return setChildren(tree, parentPath, kids)
}

function updateAt(
  tree: SidebarLayoutNode[],
  path: Path,
  patch: Partial<SidebarLayoutNode>,
): SidebarLayoutNode[] {
  const clone = structuredClone(tree) as SidebarLayoutNode[]
  let cur: SidebarLayoutNode[] = clone
  for (let d = 0; d < path.length - 1; d++) {
    const n = cur[path[d]!]
    if (!n) return tree
    n.children = n.children ?? []
    cur = n.children
  }
  const i = path[path.length - 1]!
  if (!cur[i]) return tree
  cur[i] = { ...cur[i]!, ...patch }
  return clone
}

function collectUsedRefs(tree: SidebarLayoutNode[]): Set<string> {
  const used = new Set<string>()
  const walk = (nodes: SidebarLayoutNode[]) => {
    for (const n of nodes) {
      if (n.type === 'leaf' && n.ref) used.add(n.ref)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)
  return used
}

function labelOf(
  node: SidebarLayoutNode,
  catalogByRef: Map<string, CatalogLeaf>,
  resolveLabel: (s: string) => string,
): string {
  if (node.type === 'leaf') {
    const leaf = node.ref ? catalogByRef.get(node.ref) : undefined
    const raw = node.title || leaf?.title || node.ref || '…'
    return resolveLabel(raw)
  }
  return resolveLabel(node.title || node.key || '…')
}

// ── Sortable row ──────────────────────────────────────────────────────────

function SortableRow({
  id,
  depth,
  kind,
  label,
  hidden,
  collapsed,
  onToggleCollapse,
  onRename,
  onToggleHidden,
  onDelete,
  onAddFolder,
  onAddLeaf,
  unusedLeaves,
  children,
}: {
  id: string
  depth: number
  kind: 'group' | 'folder' | 'leaf'
  label: string
  hidden?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onRename: (next: string) => void
  onToggleHidden: () => void
  onDelete: () => void
  onAddFolder?: () => void
  onAddLeaf?: (ref: string) => void
  unusedLeaves?: CatalogLeaf[]
  children?: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(label)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) {
      setDraft(label)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, label])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : hidden ? 0.45 : 1,
    paddingLeft: 8 + depth * 14,
  }

  const isCategory = kind === 'group' || kind === 'folder'

  const commitRename = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== label) onRename(next)
  }

  return (
    <div ref={setNodeRef} style={style} className="group/row">
      <div
        className={cn(
          'flex items-center gap-1 rounded-md py-1 pr-1',
          isCategory ? 'mt-2 first:mt-0' : 'hover:bg-muted/50',
          isDragging && 'bg-muted/80',
        )}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab px-0.5 active:cursor-grabbing"
          aria-label="Arrastrar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 opacity-40 group-hover/row:opacity-100" />
        </button>

        {isCategory ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-0.5"
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : (
          <Hash className="text-muted-foreground size-3.5 shrink-0 opacity-60" />
        )}

        {kind === 'folder' ? (
          <Folder className="size-3.5 shrink-0 text-amber-500/90" />
        ) : null}

        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="h-7 flex-1 text-sm"
          />
        ) : (
          <button
            type="button"
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm',
              isCategory
                ? 'text-muted-foreground text-[11px] font-semibold uppercase tracking-wider'
                : 'font-medium',
            )}
            onDoubleClick={() => setEditing(true)}
            title="Doble clic para renombrar"
          >
            {label}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
          {kind === 'group' || kind === 'folder' ? (
            <>
              {onAddFolder ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  title="Nueva carpeta"
                  onClick={onAddFolder}
                >
                  <FolderPlus className="size-3" />
                </Button>
              ) : null}
              {onAddLeaf && unusedLeaves && unusedLeaves.length > 0 ? (
                <select
                  className="border-input bg-background h-6 max-w-[110px] rounded border px-1 text-[10px]"
                  defaultValue=""
                  title="Agregar ítem"
                  onChange={(e) => {
                    const ref = e.target.value
                    e.target.value = ''
                    if (ref) onAddLeaf(ref)
                  }}
                >
                  <option value="">+ ítem</option>
                  {unusedLeaves.map((l) => (
                    <option key={l.ref} value={l.ref}>
                      {l.title}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            title="Renombrar"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            title={hidden ? 'Mostrar' : 'Ocultar'}
            onClick={onToggleHidden}
          >
            {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive size-6"
            title="Quitar"
            onClick={onDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      {!collapsed ? children : null}
    </div>
  )
}

// ── Manager ───────────────────────────────────────────────────────────────

export function SidebarLayoutManager({
  loadLayout,
  saveLayout,
  resetLayout,
  catalog,
  currentGroups,
  resolveLabel = (s) => s,
  title = 'Menú lateral',
  description = 'Arrastrá, renombrá y agrupá como en Discord. Así lo verá toda la organización.',
}: SidebarLayoutManagerProps) {
  const [tree, setTree] = React.useState<SidebarLayoutNode[]>([])
  const [baseline, setBaseline] = React.useState('[]')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [newCategory, setNewCategory] = React.useState('')

  const catalogByRef = React.useMemo(() => {
    const m = new Map<string, CatalogLeaf>()
    for (const l of catalog) {
      m.set(l.ref, { ...l, title: resolveLabel(l.title) })
      for (const a of l.aliases ?? []) m.set(a, m.get(l.ref)!)
    }
    return m
  }, [catalog, resolveLabel])

  const unused = React.useMemo(() => {
    const used = collectUsedRefs(tree)
    return catalog
      .filter((l) => !used.has(l.ref) && !(l.aliases ?? []).some((a) => used.has(a)))
      .map((l) => ({ ...l, title: resolveLabel(l.title) }))
  }, [catalog, tree, resolveLabel])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const seedFromCurrent = React.useCallback(() => {
    if (!currentGroups?.length) {
      toast.message('No hay menú actual para copiar')
      return []
    }
    return layoutTreeFromNavGroups(currentGroups, (u) => leafRefFor(u))
  }, [currentGroups])

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const doc = await loadLayout()
      let t = doc.tree ?? []
      // Empty overlay → show live menu as editable draft (Discord empty-server feel).
      if (t.length === 0 && currentGroups?.length) {
        t = seedFromCurrent()
        setBaseline('[]') // still "unsaved overlay"
      } else {
        setBaseline(JSON.stringify(t))
      }
      setTree(t)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar el menú')
    } finally {
      setLoading(false)
    }
  }, [loadLayout, currentGroups, seedFromCurrent])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const dirty = JSON.stringify(tree) !== baseline
  const folderKeys = React.useMemo(() => collectFolderKeys(tree), [tree])

  // Flat id → path index for DnD (ids are path keys)
  const idToPath = React.useMemo(() => {
    const map = new Map<string, Path>()
    const walk = (nodes: SidebarLayoutNode[], parent: Path) => {
      nodes.forEach((_, i) => {
        const path = [...parent, i]
        map.set(pathKey(path), path)
        const n = nodes[i]!
        if (n.children?.length) walk(n.children, path)
      })
    }
    walk(tree, [])
    return map
  }, [tree])

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const fromPath = idToPath.get(String(active.id))
    const toPath = idToPath.get(String(over.id))
    if (!fromPath || !toPath) return

    // Same parent → reorder siblings
    const fromParent = fromPath.slice(0, -1)
    const toParent = toPath.slice(0, -1)
    if (pathKey(fromParent) === pathKey(toParent)) {
      const kids =
        fromParent.length === 0
          ? [...tree]
          : [...(getAt(tree, fromParent)?.children ?? [])]
      const oldIndex = fromPath[fromPath.length - 1]!
      const newIndex = toPath[toPath.length - 1]!
      setTree(setChildren(tree, fromParent, arrayMove(kids, oldIndex, newIndex)))
      return
    }

    // Different parent → move node under target's parent at target index
    // (or into target if it's a folder/group)
    const overNode = getAt(tree, toPath)
    let destParent = toParent
    let destIndex = toPath[toPath.length - 1]!
    if (overNode && (overNode.type === 'group' || overNode.type === 'folder')) {
      destParent = toPath
      destIndex = overNode.children?.length ?? 0
    }

    // Prevent dropping into own descendant
    const fromKey = pathKey(fromPath)
    if (pathKey(destParent).startsWith(fromKey + '.') || pathKey(destParent) === fromKey) {
      return
    }

    setTree((prev) => {
      const { tree: without, node } = removeAt(prev, fromPath)
      if (!node) return prev
      // Recompute dest index if we removed from earlier sibling in same parent
      let idx = destIndex
      if (pathKey(fromParent) === pathKey(destParent) && fromPath[fromPath.length - 1]! < destIndex) {
        idx = Math.max(0, destIndex - 1)
      }
      return insertAt(without, destParent, idx, node)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveLayout({ version: 1, tree })
      setBaseline(JSON.stringify(tree))
      toast.success('Menú guardado para toda la organización')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      await resetLayout()
      const seeded = seedFromCurrent()
      setTree(seeded)
      setBaseline('[]')
      toast.success('Overlay restaurado — mostrando el menú default')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al resetear')
    } finally {
      setSaving(false)
    }
  }

  const addRootCategory = () => {
    const name = newCategory.trim() || 'Nueva sección'
    const key = slugifyFolderKey(name)
    setTree((t) => [
      ...t,
      {
        type: 'group',
        key: `group_${key}_${Date.now() % 10000}`,
        title: name,
        children: [],
      },
    ])
    setNewCategory('')
  }

  const renderList = (nodes: SidebarLayoutNode[], parentPath: Path): React.ReactNode => {
    const ids = nodes.map((_, i) => pathKey([...parentPath, i]))
    return (
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {nodes.map((node, i) => {
          const path = [...parentPath, i]
          const id = pathKey(path)
          const depth = parentPath.length
          const isOpen = !(collapsed[id] ?? false)
          const lbl = labelOf(node, catalogByRef, resolveLabel)

          return (
            <SortableRow
              key={id}
              id={id}
              depth={depth}
              kind={node.type}
              label={lbl}
              hidden={node.hidden}
              collapsed={!isOpen}
              onToggleCollapse={() =>
                setCollapsed((c) => ({ ...c, [id]: !(c[id] ?? false) }))
              }
              onRename={(next) => setTree((t) => updateAt(t, path, { title: next }))}
              onToggleHidden={() =>
                setTree((t) => updateAt(t, path, { hidden: !node.hidden }))
              }
              onDelete={() => setTree((t) => removeAt(t, path).tree)}
              onAddFolder={
                node.type === 'group' || node.type === 'folder'
                  ? () => {
                      const key = slugifyFolderKey(`carpeta_${Date.now() % 1000}`)
                      setTree((t) =>
                        insertAt(t, path, node.children?.length ?? 0, {
                          type: 'folder',
                          key,
                          title: 'Nueva carpeta',
                          icon: 'Folder',
                          children: [],
                        }),
                      )
                      setCollapsed((c) => ({ ...c, [id]: false }))
                    }
                  : undefined
              }
              onAddLeaf={
                node.type === 'group' || node.type === 'folder'
                  ? (ref) => {
                      const leaf = catalog.find((l) => l.ref === ref)
                      setTree((t) =>
                        insertAt(t, path, node.children?.length ?? 0, {
                          type: 'leaf',
                          ref,
                          title: leaf?.title,
                          icon: leaf?.icon,
                        }),
                      )
                    }
                  : undefined
              }
              unusedLeaves={unused}
            >
              {node.type !== 'leaf' && isOpen
                ? renderList(node.children ?? [], path)
                : null}
            </SortableRow>
          )
        })}
      </SortableContext>
    )
  }

  const activeLabel = activeId
    ? (() => {
        const p = idToPath.get(activeId)
        if (!p) return null
        const n = getAt(tree, p)
        return n ? labelOf(n, catalogByRef, resolveLabel) : null
      })()
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground max-w-xl text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => {
              setTree(seedFromCurrent())
              toast.message('Árbol recargado desde el menú actual')
            }}
          >
            Recargar menú actual
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void handleReset()}
          >
            <RotateCcw className="mr-1 size-3.5" />
            Restaurar default
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            <Save className="mr-1 size-3.5" />
            {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando menú…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* Discord-like sidebar canvas */}
          <div className="bg-muted/20 border-border overflow-hidden rounded-xl border">
            <div className="border-border/60 flex items-center justify-between border-b px-3 py-2">
              <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                Vista del menú
              </span>
              {baseline === '[]' && dirty ? (
                <span className="text-amber-600 text-[11px]">Sin guardar · borrador del menú actual</span>
              ) : dirty ? (
                <span className="text-amber-600 text-[11px]">Cambios sin guardar</span>
              ) : (
                <span className="text-muted-foreground text-[11px]">
                  {folderKeys.length
                    ? `${folderKeys.length} carpeta(s) con permiso`
                    : 'Layout activo'}
                </span>
              )}
            </div>

            <ScrollArea className="h-[min(70vh,640px)]">
              <div className="p-2 pb-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  {tree.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                      Menú vacío. Creá una sección o recargá el menú actual.
                    </p>
                  ) : (
                    renderList(tree, [])
                  )}
                  <DragOverlay>
                    {activeLabel ? (
                      <div className="bg-background border-border rounded-md border px-3 py-1.5 text-sm shadow-lg">
                        {activeLabel}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                <div className="mt-3 flex gap-2 px-2">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Nombre de sección…"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addRootCategory()
                    }}
                  />
                  <Button type="button" size="sm" className="h-8 shrink-0" onClick={addRootCategory}>
                    <Plus className="mr-1 size-3.5" />
                    Sección
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Unused pool */}
          <div className="bg-muted/10 border-border flex flex-col overflow-hidden rounded-xl border">
            <div className="border-border/60 border-b px-3 py-2">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                Sin colocar
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                Agregalos desde el menú + de cada sección
              </p>
            </div>
            <ScrollArea className="flex-1">
              <ul className="space-y-1 p-2">
                {unused.length === 0 ? (
                  <li className="text-muted-foreground px-1 py-4 text-center text-xs">
                    Todo está en el menú
                  </li>
                ) : (
                  unused.map((l) => (
                    <li key={l.ref}>
                      <button
                        type="button"
                        className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                        title={l.ref}
                        onClick={() => {
                          if (tree.length === 0) {
                            setTree([
                              {
                                type: 'group',
                                key: 'sidebar.general',
                                title: 'General',
                                children: [
                                  { type: 'leaf', ref: l.ref, title: l.title, icon: l.icon },
                                ],
                              },
                            ])
                          } else {
                            setTree((t) =>
                              insertAt(t, [0], t[0]?.children?.length ?? 0, {
                                type: 'leaf',
                                ref: l.ref,
                                title: l.title,
                                icon: l.icon,
                              }),
                            )
                          }
                        }}
                      >
                        <Hash className="text-muted-foreground size-3 shrink-0" />
                        <span className="truncate font-medium">{l.title}</span>
                        <Plus className="text-muted-foreground ml-auto size-3 shrink-0 opacity-50" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </ScrollArea>
            {folderKeys.length > 0 ? (
              <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[10px] leading-relaxed">
                Permisos:{' '}
                {folderKeys.map((k) => folderAccessCapability(k)).join(', ')}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export type { CatalogLeaf, SidebarLayoutDoc, SidebarLayoutNode }
