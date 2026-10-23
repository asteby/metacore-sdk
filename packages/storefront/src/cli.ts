import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createStorefrontClient, type FetchLike } from './client.js'
import { maskToken, repairPath } from './diagnose.js'
import { ConnectError, SDK_VERSION, redeemConnectionCode, saveConnection, stateFromGrant, writeFileAtomic } from './node.js'

export type CliIO = {
  stdout: (line: string) => void
  stderr: (line: string) => void
  /** Reads the connection code from the terminal. Must refuse when stdin is not a TTY. */
  promptCode: () => Promise<string>
  fetch?: FetchLike
  env?: Record<string, string | undefined>
  cwd?: string
}

const HELP = `Uso: npx @asteby/storefront connect --ops <url> [--env-file <ruta>] [--token-file <ruta>]

Conecta esta tienda con OPS. El código de conexión (K7QM-2XPA) se pide en la terminal; nunca va como argumento.

  --ops          Dirección de OPS (https://ops.ejemplo.com). También OPS_URL.
  --token-file   Dónde guardar la clave (por omisión ./storefront_token). Modo 0600, escritura atómica.
  --env-file     Archivo .env donde dejar SOLO OPS_URL y STOREFRONT_TOKEN_FILE (nunca la clave).
`

function parseArgs(argv: string[]): { cmd?: string; flags: Record<string, string>; bad?: string } {
  const flags: Record<string, string> = {}
  const [cmd, ...rest] = argv
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    const eq = a.indexOf('=')
    const key = (eq > 0 ? a.slice(0, eq) : a).replace(/^--/, '')
    if (!a.startsWith('--') || !['ops', 'env-file', 'token-file', 'code'].includes(key)) return { cmd, flags, bad: a }
    if (key === 'code') return { cmd, flags, bad: '--code (el código se pide en la terminal, no como argumento)' }
    const val = eq > 0 ? a.slice(eq + 1) : rest[++i]
    if (!val) return { cmd, flags, bad: a }
    flags[key] = val
  }
  return { cmd, flags }
}

/** Sets `KEY=value` lines in an env file, keeping every other line. */
export function upsertEnv(text: string, values: Record<string, string>): string {
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n')
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => new RegExp(`^\\s*(export\\s+)?${k}\\s*=`).test(l))
    if (i >= 0) lines[i] = `${k}=${v}`
    else lines.push(`${k}=${v}`)
  }
  return lines.join('\n') + '\n'
}

/** Runs the CLI. Resolves with the exit code; never prints a full token. */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const { cmd, flags, bad } = parseArgs(argv)
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    io.stdout(HELP)
    return cmd ? 0 : 1
  }
  if (cmd !== 'connect') {
    io.stderr(`Comando desconocido: ${cmd}\n${HELP}`)
    return 1
  }
  if (bad) {
    io.stderr(`Argumento no válido: ${bad}\n${HELP}`)
    return 1
  }
  const env = io.env ?? process.env
  const cwd = io.cwd ?? process.cwd()
  const opsUrl = (flags.ops ?? env.OPS_URL ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(opsUrl)) {
    io.stderr('Falta --ops con la dirección de OPS (https://…).')
    return 1
  }
  const tokenFile = resolve(cwd, flags['token-file'] ?? 'storefront_token')
  const envFile = flags['env-file'] ? resolve(cwd, flags['env-file']) : null

  let code: string
  try {
    code = (await io.promptCode()).trim()
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : 'No se pudo leer el código.')
    return 1
  }
  if (!code) {
    io.stderr('No escribiste ningún código.')
    return 1
  }

  try {
    const r = await redeemConnectionCode({ opsUrl, code, ...(io.fetch ? { fetch: io.fetch } : {}) })
    saveConnection(tokenFile, r, stateFromGrant(r, opsUrl, null))
    if (envFile) {
      const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
      if (/^\s*(export\s+)?STOREFRONT_TOKEN\s*=/m.test(current)) {
        io.stderr('Aviso: tu .env aún tiene STOREFRONT_TOKEN con una clave anterior; bórrala, el archivo de clave tiene prioridad.')
      }
      writeFileAtomic(envFile, upsertEnv(current, { OPS_URL: opsUrl, STOREFRONT_TOKEN_FILE: tokenFile }), 0o600)
    }
    io.stdout(`Conectada ✓ · ${r.scopes.length} alcances · ${maskToken(r.token)}`)
    io.stdout(`Clave guardada en ${tokenFile} (modo 0600).${envFile ? ` Variables en ${envFile}.` : ` Usa STOREFRONT_TOKEN_FILE=${tokenFile}.`}`)

    // Verify with the freshly written credential, through the same path the store will use.
    const base = r.api_base || `${opsUrl}/api/gw`
    const sf = createStorefrontClient({ baseUrl: base, token: r.token, ...(io.fetch ? { fetch: io.fetch } : {}), timeoutMs: 10_000 })
    try {
      const info = await sf.token.introspect()
      if (info.missing_scopes?.length) {
        io.stderr(`Aviso: a la clave le faltan permisos (${info.missing_scopes.join(', ')}). Repáralo en ${repairPath()}.`)
      } else {
        io.stdout(`Verificada con OPS · entorno ${info.environment ?? r.connection.environment}.`)
      }
    } catch {
      io.stderr('Aviso: la clave se guardó pero no pudimos verificarla con OPS todavía.')
    }
    return 0
  } catch (err) {
    io.stderr(err instanceof ConnectError ? err.message : 'No se pudo completar la conexión.')
    return 1
  }
}

function ttyPrompt(): Promise<string> {
  if (!process.stdin.isTTY) return Promise.reject(new Error('El código se escribe en la terminal (TTY); no se acepta por argumento ni por tubería.'))
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((res) => rl.question('Código de conexión: ', (a) => (rl.close(), res(a))))
}

// Only run when executed as the binary (not when imported by tests).
const entry = process.argv[1] ?? ''
if (/(^|[\\/])(storefront|cli)(\.js)?$/.test(entry) && !process.env.VITEST) {
  void runCli(process.argv.slice(2), {
    stdout: (l) => console.log(l),
    stderr: (l) => console.error(l),
    promptCode: ttyPrompt,
  }).then((c) => process.exit(c))
}

export { SDK_VERSION }
