import type { MockupKind, MockupProduct, MockupVariant } from '@asteby/storefront/mockup'
import type { MockupLabels } from './labels.js'
import { BUILTIN_MOCKUPS, createMockupRegistry, type MockupRegistry, type ResolveMockupKind } from './registry.js'
import type { MockupComponent } from './types.js'

const KIND_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/

/**
 * One store mockup, in one file: which products it claims, what it reads from
 * them and how it draws. Every field but `kind` and `render` is optional.
 */
export type MockupDefinition<D = any> = {
  /** Kind name (`supplement`, `tire`, `casco-moto`). Reusing a base kind replaces it. */
  kind: MockupKind
  /**
   * Claims a product for this kind. Checked in list order, before the SDK's
   * guess (`guess`: `mockup_kind` attribute, tire/part attributes, words in
   * type/category/tags). Omit it to rely on the guess or on `mockup_kind`.
   */
  match?: (product: MockupProduct, guess: MockupKind) => boolean
  /** Product (+ selected variant) → data for `render`. Default: the base extractor of the kind (generic data for new kinds). Never prices. */
  data?: (product: MockupProduct, variant?: MockupVariant | null) => D
  /** Data → accessible name (prefix it with `labels.illustration`). Default: `describeMockup`. */
  describe?: (data: D, labels: MockupLabels) => string
  /** The drawing: a component that returns a `<MockupFrame>` (or a base one: `SupplementMockup`…). */
  render: MockupComponent<D>
}

/** Typed, checked definition of a store mockup (throws on an invalid kind or a missing `render`). */
export function defineMockup<D = any>(definition: MockupDefinition<D>): MockupDefinition<D> {
  if (!definition || typeof definition.kind !== 'string' || !KIND_PATTERN.test(definition.kind)) {
    throw new TypeError(`defineMockup: invalid kind "${String(definition?.kind)}" (use a-z, 0-9, - and _)`)
  }
  if (typeof definition.render !== 'function') throw new TypeError(`defineMockup("${definition.kind}"): render is required`)
  if (definition.match !== undefined && typeof definition.match !== 'function') throw new TypeError(`defineMockup("${definition.kind}"): match must be a function`)
  return Object.freeze({ ...definition })
}

export type CreateStoreMockupsOptions = {
  /**
   * Starting registry: `builtin` (default) keeps tire, part, supplement and
   * generic for the kinds the store does not define; `none` starts empty (keep
   * a `generic` among your definitions); or pass a registry to extend.
   */
  base?: 'builtin' | 'none' | MockupRegistry
  /** Interface words (`illustration`, `servings`…) for every mockup. */
  labels?: Partial<MockupLabels>
}

/** What `<MockupProvider {...storeMockups}>` takes. */
export type StoreMockups = {
  registry: MockupRegistry
  resolveKind: ResolveMockupKind
  labels?: Partial<MockupLabels>
  /** Kinds defined by the store, in order. */
  kinds: MockupKind[]
}

/**
 * Builds the store's mockup setup from its definitions: a registry (base
 * mockups + the store's, the store's win) and a `resolveKind` that asks each
 * `match` in order and otherwise keeps the SDK's guess.
 *
 * ```tsx
 * export const storeMockups = createStoreMockups([supplement, accessory])
 * <MockupProvider {...storeMockups}>…</MockupProvider>
 * ```
 */
export function createStoreMockups(definitions: readonly MockupDefinition[], options: CreateStoreMockupsOptions = {}): StoreMockups {
  const base = options.base ?? 'builtin'
  const registry = base === 'builtin' ? createMockupRegistry(BUILTIN_MOCKUPS) : base === 'none' ? createMockupRegistry() : base.extend()
  const seen = new Set<string>()
  for (const d of definitions) {
    const def = defineMockup(d)
    if (seen.has(def.kind)) throw new TypeError(`createStoreMockups: kind "${def.kind}" is defined twice`)
    seen.add(def.kind)
    registry.register(def.kind, {
      component: def.render,
      ...(def.data ? { fromProduct: def.data } : null),
      ...(def.describe ? { describe: def.describe } : null),
    })
  }
  const matchers = definitions.filter((d) => typeof d.match === 'function')
  const resolveKind: ResolveMockupKind = (product, guess) => {
    for (const d of matchers) if (d.match!(product, guess)) return d.kind
    return guess
  }
  const out: StoreMockups = { registry, resolveKind, kinds: [...seen] }
  if (options.labels) out.labels = options.labels
  return out
}
