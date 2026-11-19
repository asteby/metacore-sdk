// `url_state` sobre el historial del router del host (misma forma que TanStack
// `RouterHistory`). Siempre REEMPLAZA (cambiar de vista no apila historial).
// Formato de cable: los strings escalares viajan crudos (`?s.view=map`), el
// resto (numeros, booleanos, null, arrays, objetos y strings que se leerian como
// uno de ellos) queda en JSON. Al leer se aceptan ambos.
import type { UrlStateAdapter } from '../page/context'

/** Prefijo de query que genui reserva para el estado de pagina. */
export const URL_STATE_PREFIX = 's.'

function isJson(raw: string): boolean {
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/** Forma genui (`"map"`, `3`) -> forma URL (`map`, `3`). */
export function encodeUrlStateValue(json: string): string {
  try {
    const v: unknown = JSON.parse(json)
    if (typeof v === 'string' && !isJson(v)) return v
  } catch {
    /* no es JSON: se deja */
  }
  return json
}

/** Forma URL -> forma genui: un token crudo es string, JSON valido es si mismo. */
export function decodeUrlStateValue(raw: string): string {
  return isJson(raw) ? raw : JSON.stringify(raw)
}

/** Lo minimo del historial del router que necesita el adaptador. */
export interface UrlStateHistory {
  location: { pathname: string; search: string; hash: string }
  replace(href: string): void
}

export function createHistoryUrlAdapter(history: UrlStateHistory): UrlStateAdapter {
  return {
    read() {
      const params = new URLSearchParams(history.location.search)
      for (const [k, v] of [...params.entries()]) {
        if (k.startsWith(URL_STATE_PREFIX)) params.set(k, decodeUrlStateValue(v))
      }
      return params
    },
    write(next) {
      const out = new URLSearchParams()
      for (const [k, v] of next.entries()) out.append(k, k.startsWith(URL_STATE_PREFIX) ? encodeUrlStateValue(v) : v)
      const { pathname, search, hash } = history.location
      const qs = out.toString()
      if (new URLSearchParams(search.replace(/^\?/, '')).toString() === qs) return
      history.replace(`${pathname}${qs ? `?${qs}` : ''}${hash}`)
    },
  }
}
