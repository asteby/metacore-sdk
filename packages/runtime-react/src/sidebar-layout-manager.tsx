/**
 * SidebarLayoutManager — admin editor for the org-wide sidebar overlay.
 * Transport-agnostic (loaders/mutators via props), same pattern as
 * PermissionsManager. Hosts wire fetchers to /api/org/sidebar-layout.
 */
import * as React from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  RotateCcw,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Folder,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ScrollArea,
  Badge,
} from '@asteby/metacore-ui/primitives'
import {
  applySidebarLayout,
  collectFolderKeys,
  folderAccessCapability,
  layoutTreeFromNavGroups,
  slugifyFolderKey,
  type CatalogLeaf,
  type SidebarLayoutDoc,
  type SidebarLayoutNode,
} from './apply-sidebar-layout'

export interface SidebarLayoutManagerProps {
  loadLayout: () => Promise<SidebarLayoutDoc>
  saveLayout: (doc: SidebarLayoutDoc) => Promise<void>
  resetLayout: () => Promise<void>
  /** Live catalog of every leaf the shell can show (core + addons). */
  catalog: CatalogLeaf[]
  /**
   * Optional: current live nav groups — used by "Partir del menú actual" to
   * seed a tree when the org has no layout yet.
   */
  currentGroups?: Array<{
    title: string
    items: Array<{
      title: string
      url: string
      icon?: string
      items?: Array<{ title: string; url: string; icon?: string }>
    }>
  }>
  title?: string
  description?: string
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

function updateAt(
  tree: SidebarLayoutNode[],
  path: number[],
  fn: (node: SidebarLayoutNode) => SidebarLayoutNode | null,
): SidebarLayoutNode[] {
  if (path.length === 0) return tree
  const [head, ...rest] = path
  return tree
    .map((n, i) => {
      if (i !== head) return n
      if (rest.length === 0) return fn(n)
      const kids = updateAt(n.children ?? [], rest, fn)
      return { ...n, children: kids }
    })
    .filter((n): n is SidebarLayoutNode => n != null)
}

function removeAt(tree: SidebarLayoutNode[], path: number[]): SidebarLayoutNode[] {
  return updateAt(tree, path, () => null).filter(Boolean) as SidebarLayoutNode[]
}

function moveSibling(tree: SidebarLayoutNode[], path: number[], dir: -1 | 1): SidebarLayoutNode[] {
  if (path.length === 0) return tree
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]!
  const getList = (nodes: SidebarLayoutNode[], p: number[]): SidebarLayoutNode[] => {
    if (p.length === 0) return nodes
    let cur: SidebarLayoutNode[] = nodes
    for (const i of p) {
      cur = cur[i]?.children ?? []
    }
    return cur
  }
  const list = [...getList(tree, parentPath)]
  const j = idx + dir
  if (j < 0 || j >= list.length) return tree
  ;[list[idx], list[j]] = [list[j]!, list[idx]!]
  if (parentPath.length === 0) return list
  return updateAt(tree, parentPath, (n) => ({ ...n, children: list }))
}

function appendChild(
  tree: SidebarLayoutNode[],
  parentPath: number[],
  child: SidebarLayoutNode,
): SidebarLayoutNode[] {
  if (parentPath.length === 0) return [...tree, child]
  return updateAt(tree, parentPath, (n) => ({
    ...n,
    children: [...(n.children ?? []), child],
  }))
}

export function SidebarLayoutManager({
  loadLayout,
  saveLayout,
  resetLayout,
  catalog,
  currentGroups,
  title = 'Menú lateral',
  description = 'Organizá carpetas y el orden del sidebar para toda la organización. Los permisos de cada carpeta aparecen en Permisos.',
}: SidebarLayoutManagerProps) {
  const [tree, setTree] = React.useState<SidebarLayoutNode[]>([])
  const [baseline, setBaseline] = React.useState<string>('[]')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [newFolderTitle, setNewFolderTitle] = React.useState('')
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const doc = await loadLayout()
      const t = doc.tree ?? []
      setTree(t)
      setBaseline(JSON.stringify(t))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar el layout')
    } finally {
      setLoading(false)
    }
  }, [loadLayout])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const dirty = JSON.stringify(tree) !== baseline
  const used = React.useMemo(() => collectUsedRefs(tree), [tree])
  const unused = React.useMemo(
    () => catalog.filter((l) => !used.has(l.ref) && !(l.aliases ?? []).some((a) => used.has(a))),
    [catalog, used],
  )
  const folderKeys = React.useMemo(() => collectFolderKeys(tree), [tree])
  const preview = React.useMemo(() => applySidebarLayout(catalog, tree), [catalog, tree])

  const pathKey = (path: number[]) => path.join('.')

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
      setTree([])
      setBaseline('[]')
      toast.success('Menú restaurado al default (addons + core)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al resetear')
    } finally {
      setSaving(false)
    }
  }

  const seedFromCurrent = () => {
    if (!currentGroups?.length) {
      toast.message('No hay menú actual para copiar')
      return
    }
    const seeded = layoutTreeFromNavGroups(currentGroups)
    setTree(seeded)
    toast.message('Árbol partido del menú actual — guardá para aplicar')
  }

  const addRootFolder = () => {
    const titleText = newFolderTitle.trim() || 'Nueva carpeta'
    const key = slugifyFolderKey(titleText)
    setTree((t) => [
      ...t,
      {
        type: 'group',
        key: `group_${key}`,
        title: titleText,
        children: [{ type: 'folder', key, title: titleText, icon: 'Folder', children: [] }],
      },
    ])
    setNewFolderTitle('')
  }

  const addLeafTo = (parentPath: number[], leaf: CatalogLeaf) => {
    setTree((t) =>
      appendChild(t, parentPath, {
        type: 'leaf',
        ref: leaf.ref,
        title: leaf.title,
        icon: leaf.icon,
      }),
    )
  }

  const renderNode = (node: SidebarLayoutNode, path: number[]): React.ReactNode => {
    const k = pathKey(path)
    const isOpen = expanded[k] ?? true
    const isFolderish = node.type === 'group' || node.type === 'folder'

    return (
      <div key={k} className="border-border/60 rounded-md border bg-background/50">
        <div className="flex items-center gap-1 px-2 py-1.5">
          {isFolderish ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5"
              onClick={() => setExpanded((e) => ({ ...e, [k]: !isOpen }))}
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <GripVertical className="text-muted-foreground size-4 shrink-0 opacity-40" />
          )}
          {node.type === 'folder' ? (
            <Folder className="text-amber-600 size-4 shrink-0" />
          ) : node.type === 'leaf' ? (
            <FileText className="text-muted-foreground size-4 shrink-0" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {node.title || node.key || node.ref}
          </span>
          {node.type === 'folder' && node.key ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {folderAccessCapability(node.key)}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            title={node.hidden ? 'Mostrar' : 'Ocultar'}
            onClick={() =>
              setTree((t) => updateAt(t, path, (n) => ({ ...n, hidden: !n.hidden })))
            }
          >
            {node.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setTree((t) => moveSibling(t, path, -1))}
          >
            ↑
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setTree((t) => moveSibling(t, path, 1))}
          >
            ↓
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive size-7"
            onClick={() => setTree((t) => removeAt(t, path))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        {isFolderish && isOpen ? (
          <div className="border-border/40 space-y-1 border-t px-2 py-2 pl-6">
            {(node.children ?? []).map((child, i) => renderNode(child, [...path, i]))}
            {unused.length > 0 ? (
              <select
                className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const ref = e.target.value
                  e.target.value = ''
                  const leaf = catalog.find((l) => l.ref === ref)
                  if (leaf) addLeafTo(path, leaf)
                }}
              >
                <option value="">+ Agregar ítem…</option>
                {unused.map((l) => (
                  <option key={l.ref} value={l.ref}>
                    {l.title} ({l.ref})
                  </option>
                ))}
              </select>
            ) : null}
            {node.type === 'group' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const titleText = 'Nueva carpeta'
                  const key = slugifyFolderKey(`${titleText}_${path.join('')}_${Date.now() % 1000}`)
                  setTree((t) =>
                    appendChild(t, path, {
                      type: 'folder',
                      key,
                      title: titleText,
                      icon: 'Folder',
                      children: [],
                    }),
                  )
                }}
              >
                <FolderPlus className="mr-1 size-3.5" />
                Subcarpeta
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={seedFromCurrent}>
            Partir del menú actual
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void handleReset()}>
            <RotateCcw className="mr-1 size-3.5" />
            Restaurar default
          </Button>
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
            <Save className="mr-1 size-3.5" />
            {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Árbol del menú</CardTitle>
              <CardDescription>
                Carpetas nuevas otorgan el permiso{' '}
                <code className="text-xs">folder.&lt;key&gt;.access</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Nueva sección + carpeta</Label>
                  <Input
                    value={newFolderTitle}
                    onChange={(e) => setNewFolderTitle(e.target.value)}
                    placeholder="Configuración"
                  />
                </div>
                <Button type="button" className="mt-5" size="sm" onClick={addRootFolder}>
                  <FolderPlus className="mr-1 size-3.5" />
                  Crear
                </Button>
              </div>
              <ScrollArea className="h-[420px] pr-2">
                <div className="space-y-2">
                  {tree.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Sin overlay — el sidebar usa el merge default. Partí del menú actual o
                      creá una carpeta.
                    </p>
                  ) : (
                    tree.map((n, i) => renderNode(n, [i]))
                  )}
                </div>
              </ScrollArea>
              {folderKeys.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Carpetas con permiso: {folderKeys.map((k) => folderAccessCapability(k)).join(', ')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Catálogo sin usar / vista previa</CardTitle>
              <CardDescription>
                Ítems disponibles para colocar. La vista previa aplica el overlay sobre el
                catálogo vivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[200px] rounded-md border p-2">
                {unused.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Todos los ítems están en el árbol.</p>
                ) : (
                  <ul className="space-y-1">
                    {unused.map((l) => (
                      <li key={l.ref} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">
                          {l.title}{' '}
                          <span className="text-muted-foreground font-mono">{l.ref}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 text-xs"
                          onClick={() => {
                            if (tree.length === 0) {
                              setTree([
                                {
                                  type: 'group',
                                  key: 'sidebar.general',
                                  title: 'sidebar.general',
                                  children: [
                                    { type: 'leaf', ref: l.ref, title: l.title, icon: l.icon },
                                  ],
                                },
                              ])
                            } else {
                              addLeafTo([0], l)
                            }
                          }}
                        >
                          +
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Preview
                </p>
                {!preview ? (
                  <p className="text-muted-foreground text-sm">Default merge (sin overlay).</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {preview.map((g) => (
                      <li key={g.title}>
                        <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {g.title}
                        </div>
                        <ul className="mt-1 space-y-0.5 pl-2">
                          {g.items.map((it) => (
                            <li key={`${it.title}-${it.url}`}>
                              {it.folderKey ? `📁 ${it.title}` : it.title}
                              {it.items?.length ? (
                                <ul className="text-muted-foreground pl-4 text-xs">
                                  {it.items.map((c) => (
                                    <li key={c.ref || c.url}>{c.title}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export type { CatalogLeaf, SidebarLayoutDoc, SidebarLayoutNode }
