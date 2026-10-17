import { createContext, useContext, type ReactNode } from 'react'
import { mockupDataFromProduct, type MockupKind, type MockupProduct, type MockupVariant } from '@asteby/storefront/mockup'
import { GenericMockup } from './generic.js'
import { DEFAULT_MOCKUP_LABELS, describeMockup, type MockupLabels } from './labels.js'
import { PartMockup } from './part.js'
import { SupplementMockup } from './supplement.js'
import { TireMockup } from './tire.js'
import type { MockupComponent, MockupRenderer } from './types.js'

/** A renderer, or just its component (data then comes from the built-in extractor). */
export type MockupRendererInput<D = any> = MockupRenderer<D> | MockupComponent<D>

/** A resolved renderer: every hook filled in. */
export type ResolvedMockupRenderer<D = any> = Required<MockupRenderer<D>>

export type MockupRegistry = {
  /** Adds or replaces a kind. Returns the registry (chainable). */
  register<D>(kind: MockupKind, renderer: MockupRendererInput<D>): MockupRegistry
  get(kind: MockupKind): ResolvedMockupRenderer | undefined
  has(kind: MockupKind): boolean
  kinds(): MockupKind[]
  /** New registry with these entries plus the overrides (the original is untouched). */
  extend(overrides?: Partial<Record<MockupKind, MockupRendererInput>>): MockupRegistry
}

const KIND_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/

function normalize(kind: MockupKind, input: MockupRendererInput): ResolvedMockupRenderer {
  const r: MockupRenderer = typeof input === 'function' ? { component: input } : input
  if (!r || typeof r.component !== 'function') throw new TypeError(`Mockup "${kind}": component is required`)
  return {
    component: r.component,
    fromProduct: r.fromProduct ?? ((product: MockupProduct, variant?: MockupVariant | null) => mockupDataFromProduct(kind, product, variant)),
    describe: r.describe ?? ((data: any, labels: MockupLabels) => describeMockup(data, labels)),
  }
}

/** A registry of mockup kinds. Pass `BUILTIN_MOCKUPS` (or a subset) to start from the base ones. */
export function createMockupRegistry(initial: Partial<Record<MockupKind, MockupRendererInput>> = {}): MockupRegistry {
  const map = new Map<string, ResolvedMockupRenderer>()
  const registry: MockupRegistry = {
    register(kind, renderer) {
      if (!KIND_PATTERN.test(kind)) throw new TypeError(`Invalid mockup kind "${kind}" (use a-z, 0-9, - and _)`)
      map.set(kind, normalize(kind, renderer as MockupRendererInput))
      return registry
    },
    get: (kind) => map.get(kind),
    has: (kind) => map.has(kind),
    kinds: () => [...map.keys()],
    extend(overrides = {}) {
      const next = createMockupRegistry()
      for (const [k, r] of map) next.register(k, r)
      for (const [k, r] of Object.entries(overrides)) if (r) next.register(k, r)
      return next
    },
  }
  for (const [k, r] of Object.entries(initial)) if (r) registry.register(k, r)
  return registry
}

/** The four base mockups. */
export const BUILTIN_MOCKUPS = {
  tire: TireMockup,
  part: PartMockup,
  supplement: SupplementMockup,
  generic: GenericMockup,
} satisfies Record<string, MockupRendererInput>

/** Registry used when no `MockupProvider`/`registry` prop is given. */
export const defaultMockupRegistry: MockupRegistry = createMockupRegistry(BUILTIN_MOCKUPS)

/**
 * Registers a kind in the default registry (call it once at module scope, e.g.
 * in `app/root.tsx`). For an isolated registry use `createMockupRegistry` + `MockupProvider`.
 */
export function registerMockup<D>(kind: MockupKind, renderer: MockupRendererInput<D>): MockupRegistry {
  return defaultMockupRegistry.register(kind, renderer)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Store-level kind resolver. Receives the default guess; return a kind to
 * override it, or `null`/`undefined` to keep the default.
 */
export type ResolveMockupKind = (product: MockupProduct, defaultKind: MockupKind) => MockupKind | null | undefined

export type MockupConfig = {
  registry: MockupRegistry
  resolveKind?: ResolveMockupKind | undefined
  labels: MockupLabels
}

const MockupContext = createContext<MockupConfig | null>(null)

export type MockupProviderProps = {
  registry?: MockupRegistry
  resolveKind?: ResolveMockupKind
  labels?: Partial<MockupLabels>
  children?: ReactNode
}

/** Per-store mockup configuration (registry, kind resolver, labels) for every `ProductImage` below. */
export function MockupProvider({ registry, resolveKind, labels, children }: MockupProviderProps) {
  const parent = useContext(MockupContext)
  const value: MockupConfig = {
    registry: registry ?? parent?.registry ?? defaultMockupRegistry,
    resolveKind: resolveKind ?? parent?.resolveKind,
    labels: { ...(parent?.labels ?? DEFAULT_MOCKUP_LABELS), ...labels },
  }
  return <MockupContext.Provider value={value}>{children}</MockupContext.Provider>
}

/** Current mockup configuration (defaults when there is no provider). */
export function useMockupConfig(): MockupConfig {
  return useContext(MockupContext) ?? { registry: defaultMockupRegistry, labels: DEFAULT_MOCKUP_LABELS }
}
