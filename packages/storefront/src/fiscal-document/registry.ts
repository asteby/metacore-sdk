import type { IdentityExtractorFn } from './types.js'

const extractors = new Map<string, IdentityExtractorFn>()

/**
 * Registers the extractor of a document the `rules@1` engine cannot describe (a country whose document needs
 * code). `key` is the document `kind` (`XX:doc`) or the `<id>` of a spec with `engine: 'plugin:<id>'`; the id
 * wins. The server-side validator stays the region's: a plugin only reads text. Replaces a previous one.
 * Returns a function that unregisters it.
 */
export function registerIdentityExtractor(key: string, fn: IdentityExtractorFn): () => void {
  if (!key || typeof fn !== 'function') throw new TypeError('registerIdentityExtractor: key and fn are required')
  extractors.set(key, fn)
  return () => {
    if (extractors.get(key) === fn) extractors.delete(key)
  }
}

export function getIdentityExtractor(key: string): IdentityExtractorFn | undefined {
  return extractors.get(key)
}
