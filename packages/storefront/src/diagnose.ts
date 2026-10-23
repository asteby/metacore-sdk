import type { StorefrontClient } from './client.js'
import { isStorefrontError } from './errors.js'
import type { TokenIntrospection } from './types.js'

/** `sk_…a91f`: the prefix and the last four characters, never enough to use the token. */
export function maskToken(token: string | null | undefined): string {
  if (!token) return '(sin token)'
  const prefix = /^[a-z]{2}_/.exec(token)?.[0] ?? ''
  return token.length <= prefix.length + 8 ? `${prefix}…` : `${prefix}…${token.slice(-4)}`
}

export type DiagnoseOptions = {
  /** Where the warning goes (default `console.warn`). Receives ONE line per problem. */
  log?: (message: string) => void
  /** Name of the connection, shown in the repair path. */
  connectionName?: string
  /** Give up after this long (default 3000 ms). */
  timeoutMs?: number
}

/** Where the operator repairs a connection in OPS (es-MX, as the screen names it). */
export function repairPath(connectionName?: string): string {
  return `OPS → Conexiones y API → ${connectionName ?? '<conexión>'} → Reparar permisos`
}

/**
 * Startup check of the store's credential: asks `token.introspect()` and, when scopes are missing, logs ONE clear
 * warning with the repair path (never the token, only `sk_…a91f`). It NEVER throws and is meant to be fired and
 * forgotten, so it cannot delay or break the boot:
 *
 * ```ts
 * void diagnose(storefront)
 * ```
 *
 * Resolves with the introspection, or `null` when it could not be obtained (older OPS, outage, bad token).
 */
export async function diagnose(client: StorefrontClient, options: DiagnoseOptions = {}): Promise<TokenIntrospection | null> {
  const log = options.log ?? ((m: string) => console.warn(m))
  const timeoutMs = options.timeoutMs ?? 3000
  const raw = client.config.token
  let mask: string
  try {
    mask = maskToken(typeof raw === 'function' ? raw() : raw)
  } catch {
    mask = maskToken(null)
  }
  try {
    const info = await client.token.introspect({ signal: AbortSignal.timeout(timeoutMs) })
    const missing = Array.isArray(info?.missing_scopes) ? info.missing_scopes : []
    if (missing.length > 0) {
      log(
        `[@asteby/storefront] La credencial ${mask} no tiene permisos que la tienda necesita: ${missing.join(', ')}. ` +
          `Repáralo en ${repairPath(options.connectionName)} (no hace falta cambiar la clave ni reiniciar).`,
      )
    }
    return info ?? null
  } catch (err) {
    if (isStorefrontError(err) && err.status === 401) {
      try {
        log(`[@asteby/storefront] OPS rechazó la credencial ${mask} (401): está revocada o vencida. Vuelve a conectar la tienda en OPS → Conexiones y API.`)
      } catch {
        /* a broken logger must not break boot */
      }
    }
    return null
  }
}
