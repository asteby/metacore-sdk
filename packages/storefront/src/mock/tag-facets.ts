// GET /storefront/tag-facets in the mock: the same rules as storefront_api 0.10.0 (tagfacets_domain.go), over the
// tags of the mock's products. One level at a time: the options are the next segment under `path`, each with the
// number of products that carry a tag through it; `count` is the number of products under `path` itself.
import type { TagFacetOption, TagFacets } from '../types.js'

const MAX_DEPTH = 6 // segments of a tag below the prefix
const MAX_PATH = MAX_DEPTH - 1
const MAX_PATH_LEN = 256
const MAX_SEGMENT = 64
const MAX_OPTIONS = 500
const MAX_PREFIX = 24

export class TagFacetsError extends Error {
  constructor(
    message: string,
    readonly field: 'prefix' | 'path' | 'key',
  ) {
    super(message)
  }
}

export function validTagPrefix(p: string): boolean {
  return p.length >= 2 && p.length <= MAX_PREFIX && /^[a-z][a-z0-9_-]*:$/.test(p)
}

/** A slugged segment: lowercase ASCII, digits and `. _ + -`, starting with a letter or digit. */
export function validTagSegment(s: string): boolean {
  return s.length > 0 && s.length <= MAX_SEGMENT && /^[a-z0-9][a-z0-9._+-]*$/.test(s)
}

/** Reads `?prefix=&path=` or `?key=` against the shop's enabled prefixes (the first is the default). */
export function parseTagFacetsQuery(search: URLSearchParams, allowed: readonly string[] = ['fit:']): { prefix: string; path: string[] } {
  const enabled = allowed.length ? allowed : ['fit:']
  const one = (k: string) => (search.get(k) ?? '').trim().toLowerCase()
  let key = one('key')
  let prefix = one('prefix')
  let path = one('path')
  if (key) {
    if (prefix || path) throw new TagFacetsError('key cannot be combined with prefix or path', 'key')
    const i = key.indexOf(':')
    if (i < 0) throw new TagFacetsError('key must look like <prefix>:<segment>/<segment>', 'key')
    prefix = key.slice(0, i + 1)
    path = key.slice(i + 1)
    key = ''
  }
  const p = prefix || enabled[0]!
  if (!validTagPrefix(p)) throw new TagFacetsError("prefix must be lowercase letters, digits, - or _, and end with ':'", 'prefix')
  if (!enabled.includes(p)) throw new TagFacetsError('prefix is not enabled for facets in this shop', 'prefix')
  path = path.replace(/^\/+|\/+$/g, '')
  if (!path) return { prefix: p, path: [] }
  if (path.length > MAX_PATH_LEN) throw new TagFacetsError(`path has at most ${MAX_PATH_LEN} characters`, 'path')
  const segs = path.split('/')
  if (segs.length > MAX_PATH) throw new TagFacetsError(`path has at most ${MAX_PATH} segments`, 'path')
  if (!segs.every(validTagSegment)) throw new TagFacetsError('path segments are lowercase letters, digits and . _ + - (max 64 characters)', 'path')
  return { prefix: p, path: segs }
}

/** Segments of one lowercased tag under the prefix; `null` for a tag the facets ignore (bad slug, too deep, universal). */
function tagSegments(tag: string, prefix: string): string[] | null {
  if (!tag.startsWith(prefix) || tag.length === prefix.length) return null
  const segs = tag.slice(prefix.length).split('/')
  if (segs.length > MAX_DEPTH || !segs.every(validTagSegment) || segs[0] === 'universal') return null
  return segs
}

const tagYear = (s: string): number | null => {
  if (!/^\d{4}$/.test(s)) return null
  const n = Number(s)
  return n >= 1900 && n <= 2199 ? n : null
}

const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The answer for one tag list per visible product. */
export function tagFacetsFromTags(tagLists: readonly (readonly string[])[], query: { prefix: string; path: string[] }): TagFacets {
  const n = query.path.length
  let under = 0
  const byOption = new Map<string, number>()
  for (const tags of tagLists) {
    let matched = false
    const seen = new Set<string>()
    for (const raw of tags) {
      const segs = tagSegments(raw.trim().toLowerCase(), query.prefix)
      if (!segs || segs.length < n || query.path.some((p, i) => segs[i] !== p)) continue
      matched = true
      const next = segs[n]
      if (next !== undefined && !seen.has(next)) {
        seen.add(next)
        byOption.set(next, (byOption.get(next) ?? 0) + 1)
      }
    }
    if (matched) under++
  }
  let options: TagFacetOption[] = [...byOption].map(([id, count]) => ({ id, count }))
  options.sort((a, b) => b.count - a.count || byBytes(a.id, b.id))
  let truncated = false
  if (options.length > MAX_OPTIONS) {
    options = options.slice(0, MAX_OPTIONS)
    truncated = true
  }
  const years = options.length > 0 && options.every((o) => tagYear(o.id) !== null)
  options.sort(years ? (a, b) => tagYear(a.id)! - tagYear(b.id)! : (a, b) => byBytes(a.id, b.id))
  const res: TagFacets = { prefix: query.prefix, path: query.path, level: n, count: under, options }
  if (years) {
    const runs: [number, number][] = []
    for (const o of options) {
      const y = tagYear(o.id)!
      const last = runs[runs.length - 1]
      if (last && last[1] + 1 === y) last[1] = y
      else runs.push([y, y])
    }
    res.years = runs
  }
  if (truncated) res.truncated = true
  return res
}
