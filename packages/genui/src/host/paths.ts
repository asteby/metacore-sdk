// Ayudas genericas que todo host necesita y no deben duplicarse.

/**
 * Ruta interna segura: empieza con una sola `/`, sin esquema, sin `//`, sin
 * barra invertida ni caracteres de control. `javascript:`, `//host`, `https://`
 * y `/\host` quedan fuera.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 2048) return false
  if (!path.startsWith('/') || path.startsWith('//')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false
  return true
}

/** Nombres de bloques custom (`component` / `ext`) que usa un cuerpo, en orden y sin repetir. */
export function collectCustomBlockNames(blocks: unknown): string[] {
  const seen = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    for (const k of ['component', 'ext']) if (typeof n[k] === 'string') seen.add(n[k] as string)
    walk(n.blocks)
    walk(n.tabs)
  }
  walk(blocks)
  return [...seen]
}

/** Tipos de bloque usados por un cuerpo (recorre `blocks` y `tabs[].blocks`). */
export function collectBlockTypes(blocks: unknown): Set<string> {
  const out = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (typeof n.type === 'string') out.add(n.type)
    walk(n.blocks)
    walk(n.tabs)
  }
  walk(blocks)
  return out
}
