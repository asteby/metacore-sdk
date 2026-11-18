import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'
import type { GenUIIconResolver } from './icons'

/** A genui/v2 block as the renderers see it: already validated by `parseGenUI`. */
export type GenUIBlock = { type: string; id?: string; fallback?: string; [key: string]: any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type GenUIRow = Record<string, unknown>

/** Rows of a declared `data.<name>` source, resolved by the HOST with the viewer's permissions. */
export type GenUISources = Record<string, GenUIRow[] | undefined>

export interface GenUIActionRequest {
  /** The declared action (a validated verb object), `$ref`s NOT resolved in phase 1. */
  action: Record<string, unknown>
  /** Block that raised it. */
  blockId?: string
  /** Free context, e.g. the selected map point. */
  context?: Record<string, unknown>
}

/** What a block renderer receives. */
export interface GenUIBlockRendererProps<B extends GenUIBlock = GenUIBlock> {
  block: B
  /** Renders child blocks (containers). */
  renderBlocks: (blocks: GenUIBlock[]) => ReactNode
  /** Rows of the block's `source`, when the host supplied them (else undefined). */
  rows?: GenUIRow[]
  /** Text of a `label`/`text` value: literal, `{$t}` through the host, `{$ref}` is empty until the binding engine (phase 2). */
  text: (value: unknown) => string
  navigate: (path: string) => void
  /** Hands a declared action to the host (`navigate` with a path is handled here). */
  act: (req: GenUIActionRequest) => void
  allowExternalLinks: boolean
  locale?: string
  currency?: string
}

export type GenUIBlockRenderer<B extends GenUIBlock = GenUIBlock> = ComponentType<GenUIBlockRendererProps<B>>

const registry = new Map<string, GenUIBlockRenderer>()

/**
 * Registers the renderer of a block type (`map`, `chart`, `form`, an addon's
 * `ext`…). Heavy renderers (MapLibre, charts) live in their own packages and
 * register themselves here, so genui never imports them. Returns a function
 * that restores the previous renderer. A `GenUIProvider` can override per tree.
 */
export function registerGenUIBlockRenderer<B extends GenUIBlock = GenUIBlock>(type: string, renderer: GenUIBlockRenderer<B>): () => void {
  const prev = registry.get(type)
  registry.set(type, renderer as unknown as GenUIBlockRenderer)
  return () => {
    if (registry.get(type) === renderer) prev ? registry.set(type, prev) : registry.delete(type)
  }
}

export function getGenUIBlockRenderer(type: string): GenUIBlockRenderer | undefined {
  return registry.get(type)
}

/** Block types with a renderer registered (the `blocks` of the client's caps, plus the built-ins). */
export function registeredGenUIBlocks(): string[] {
  return [...registry.keys()]
}

export interface GenUIContextValue {
  renderers?: Record<string, GenUIBlockRenderer>
  sources?: GenUISources
  onNavigate?: (path: string) => void
  onAction?: (req: GenUIActionRequest) => void
  /** Resolves `{$t}` keys. Default: the key itself. */
  t?: (key: string, args?: Record<string, unknown>) => string
  /** Literal http(s) links. Default off: only the chat turns it on. */
  allowExternalLinks?: boolean
  locale?: string
  currency?: string
  /** Resolves icon names declared in manifests (e.g. "MapPin") to host components. Falls back to the built-in set, then a neutral icon. */
  resolveIcon?: GenUIIconResolver
}

const Ctx = createContext<GenUIContextValue>({})

export interface GenUIProviderProps extends GenUIContextValue {
  children?: ReactNode
}

/**
 * Supplies what the host owns: sources already scoped to the viewer, routing,
 * action handling, i18n and per-tree renderer overrides. Providers nest: inner
 * values win, `renderers` and `sources` merge.
 */
export function GenUIProvider({ children, ...value }: GenUIProviderProps) {
  const parent = useContext(Ctx)
  const merged = useMemo<GenUIContextValue>(
    () => ({
      ...parent,
      ...stripUndefined(value),
      renderers: { ...parent.renderers, ...value.renderers },
      sources: { ...parent.sources, ...value.sources },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parent, value.renderers, value.sources, value.onNavigate, value.onAction, value.t, value.allowExternalLinks, value.locale, value.currency, value.resolveIcon],
  )
  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function useGenUI(): GenUIContextValue {
  return useContext(Ctx)
}
