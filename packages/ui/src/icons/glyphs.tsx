import { useEffect, useReducer, type SVGProps } from 'react'
import { createLucideIcon, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * One registry for every Lucide glyph resolved by name, shared by the
 * sidebar, table actions, menus and any host code.
 *
 *   - A glyph resolves synchronously once this browser has seen it: its SVG
 *     data is kept in localStorage and rebuilt on the next load, before the
 *     first render, instead of waiting for its chunk.
 *   - Each name maps to one component for the page's life, so a glyph never
 *     remounts as a different component once its chunk arrives.
 *   - Until an unseen glyph loads, <Glyph> draws an empty <svg> of the same
 *     size, so the text next to it doesn't move when it appears.
 */

export type GlyphNode = [string, Record<string, string>][]

type GlyphModule = {
  default: LucideIcon
  // Lucide ≥1.3x exports the glyph's data next to the component; which name
  // depends on the release.
  __iconNode?: GlyphNode
  __iconData?: { node?: GlyphNode }
}
type GlyphLoaders = Record<string, () => Promise<GlyphModule>>

/** localStorage entry with the SVG data of every glyph seen on this origin. */
export const GLYPH_STORE_KEY = 'mc:ui:glyphs:v1'
const GLYPH_STORE_MAX = 400
const GLYPH_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g'])

const glyphs = new Map<string, LucideIcon>()
const missing = new Set<string>()
const pending = new Map<string, Promise<LucideIcon | null>>()
let stored: Record<string, GlyphNode> | null = null
let writeScheduled = false

// The name → import() map of every Lucide glyph (~160 KB raw) loads with the
// first glyph that is not stored yet, never with the package root.
let loaders: Promise<GlyphLoaders> | null = null
function loadLoaders(): Promise<GlyphLoaders> {
  loaders ??= import('lucide-react/dynamicIconImports').then(
    (mod) => mod.default as unknown as GlyphLoaders,
    (err) => {
      loaders = null
      throw err
    },
  )
  return loaders
}

/** `shopping-cart`, `shopping_cart`, `ShoppingCart` → `shopping-cart`. */
export function glyphKey(name: string): string {
  return name
    .replace(/Icon$/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

function isGlyphNode(node: unknown): node is GlyphNode {
  return (
    Array.isArray(node) &&
    node.every(
      (el) =>
        Array.isArray(el) &&
        GLYPH_TAGS.has(el[0]) &&
        el[1] !== null &&
        typeof el[1] === 'object' &&
        Object.entries(el[1]).every(
          ([k, v]) => typeof v === 'string' && !/^on|^dangerously/i.test(k),
        ),
    )
  )
}

function readStore(): Record<string, GlyphNode> {
  if (stored) return stored
  stored = {}
  try {
    const raw = globalThis.localStorage?.getItem(GLYPH_STORE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      for (const [key, node] of Object.entries(parsed)) {
        if (isGlyphNode(node)) stored[key] = node
      }
    }
  } catch {
    /* private mode / corrupt entry: start empty */
  }
  return stored
}

function remember(key: string, mod: GlyphModule): void {
  const node = mod.__iconData?.node ?? mod.__iconNode
  const store = readStore()
  if (store[key] || !isGlyphNode(node)) return
  const keys = Object.keys(store)
  if (keys.length >= GLYPH_STORE_MAX && keys[0]) delete store[keys[0]]
  store[key] = node
  // A table resolves dozens of glyphs in the same tick: write once.
  if (writeScheduled) return
  writeScheduled = true
  setTimeout(() => {
    writeScheduled = false
    try {
      globalThis.localStorage?.setItem(GLYPH_STORE_KEY, JSON.stringify(readStore()))
    } catch {
      /* quota: the glyphs still load from their chunks */
    }
  }, 0)
}

/**
 * The glyph for `name` if it can render right now: registered, loaded
 * earlier in this page, or stored by a previous visit. Undefined otherwise.
 */
export function getGlyph(name: string): LucideIcon | undefined {
  if (!name) return undefined
  const key = glyphKey(name)
  const known = glyphs.get(key)
  if (known) return known
  const node = readStore()[key]
  if (!node) return undefined
  const icon = createLucideIcon(key, node as Parameters<typeof createLucideIcon>[1])
  glyphs.set(key, icon)
  return icon
}

/** True once `name` was looked up and Lucide has no such glyph. */
export function isMissingGlyph(name: string): boolean {
  return missing.has(glyphKey(name))
}

/** Loads `name` (once per page). Resolves null for a name Lucide lacks. */
export function loadGlyph(name: string): Promise<LucideIcon | null> {
  const ready = getGlyph(name)
  if (ready) return Promise.resolve(ready)
  const key = glyphKey(name)
  if (missing.has(key)) return Promise.resolve(null)
  let job = pending.get(key)
  if (job) return job
  job = loadLoaders()
    .then(async (all) => {
      const loader = all[key]
      if (!loader) {
        missing.add(key)
        return null
      }
      const mod = await loader()
      remember(key, mod)
      // Something may have registered it meanwhile: keep that component.
      const icon = glyphs.get(key) ?? mod.default
      glyphs.set(key, icon)
      return icon
    })
    .finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}

/**
 * Loads glyphs ahead of their first render, e.g. every action icon of a
 * table as soon as its metadata arrives, so opening a menu draws them at once.
 */
export function preloadGlyphs(names: Iterable<string | null | undefined>): Promise<void> {
  const jobs: Promise<unknown>[] = []
  for (const name of names) {
    if (name && !getGlyph(name)) jobs.push(loadGlyph(name).catch(() => null))
  }
  return Promise.all(jobs).then(() => undefined)
}

/**
 * Registers components the host already imports statically, so resolving
 * their names needs no chunk at all.
 */
export function registerGlyphs(icons: Record<string, LucideIcon>): void {
  for (const [name, icon] of Object.entries(icons)) {
    const key = glyphKey(name)
    if (!glyphs.has(key)) glyphs.set(key, icon)
  }
}

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  name: string
  className?: string
  size?: number | string
  /** Drawn instead of nothing when Lucide has no glyph by that name. */
  fallback?: LucideIcon
}

/**
 * A Lucide glyph by name. Renders synchronously when the glyph is known;
 * otherwise an empty <svg> of the same size holds its place until it loads.
 */
export function Glyph({ name, className, size, fallback: Fallback, style, ...rest }: GlyphProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const Icon = getGlyph(name)

  useEffect(() => {
    if (!name || getGlyph(name) || isMissingGlyph(name)) return
    let live = true
    loadGlyph(name).then(
      () => live && rerender(),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [name])

  if (Icon) return <Icon className={className} size={size} style={style} {...rest} />
  if (name && isMissingGlyph(name)) {
    return Fallback ? <Fallback className={className} size={size} style={style} {...rest} /> : null
  }
  // An empty <svg> with Lucide's own attributes: whatever sizes the real
  // glyph (its class, `size`, or a parent's `[&_svg]:size-4`) sizes this.
  return (
    <svg
      aria-hidden="true"
      data-glyph-pending={name}
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      className={cn('lucide', className)}
      style={style}
    />
  )
}
