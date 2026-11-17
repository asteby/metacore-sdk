#!/usr/bin/env node
// Publica (o, si npm lo exige, prepara en staging) cada paquete publico del
// workspace cuya version local aun no esta publicada.
//
// Por paquete:
//   1) INTENTA `npm publish <tgz> --access public`. Con `id-token: write`,
//      npm >= 11.5 y un publicador confiable configurado (`npm trust github`),
//      npm autentica por OIDC: sin token y sin aprobacion humana. Este intento
//      corre con el entorno ambiente, SIN el secreto NPM_STAGE_TOKEN (el
//      workflow lo entrega con ese nombre, no como NODE_AUTH_TOKEN), asi que
//      solo puede autenticar por OIDC.
//   2) Si npm responde que exige staging (E_STAGE_REQUIRED / "staging area") o
//      rechaza por politica/autenticacion (E401/E403/E404), cae a
//      `npm stage publish`, ahora CON el token (NPM_STAGE_TOKEN) si existe; un
//      humano aprueba en npmjs.com -> Staged Packages.
//   3) Cualquier otro error es un fallo con el mensaje real de npm.
// - Publicacion directa OK: crea el tag git local e imprime `New tag: n@v`, que
//   changesets/action usa para empujar tags y crear GitHub Releases.
//   Lo preparado en staging NO genera tag (no esta publicado hasta aprobar).
// - Idempotente: omite versiones ya publicadas o con etapa pendiente.
// - Un fallo no detiene a los demas; sale 1 si alguno fallo.
// - Usa `pnpm pack` (resuelve `workspace:*` y publishConfig) y pasa el .tgz a npm.
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEAD_STATUSES = new Set([
  'rejected', 'failed', 'expired', 'cancelled', 'canceled', 'error', 'invalid',
])

/** Ejecucion real de un comando; en tests se inyecta un doble. */
export function defaultRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error }
}

/** Extrae el primer JSON (objeto o array) de una salida que puede traer avisos. */
export function parseJson(text) {
  if (!text) return undefined
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{' && text[i] !== '[') continue
    for (let j = text.length; j > i; j--) {
      const c = text[j - 1]
      if (c !== '}' && c !== ']') continue
      try { return JSON.parse(text.slice(i, j)) } catch { /* seguir */ }
    }
  }
  return undefined
}

/** Mensaje real de npm (codigo + resumen/detalle), nunca "undefined". */
export function npmErrorMessage(res) {
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
  const json = parseJson(out)
  const err = json && typeof json === 'object' ? (json.error ?? json) : undefined
  const parts = []
  if (err && typeof err === 'object' && (err.code || err.summary || err.detail)) {
    if (err.code) parts.push(`[${err.code}]`)
    if (err.summary) parts.push(String(err.summary))
    if (err.detail && err.detail !== err.summary) parts.push(String(err.detail))
  }
  if (parts.length) return parts.join(' ')
  const lines = out.split('\n').map((l) => l.trim()).filter((l) => l && !/^npm warn/i.test(l))
  const npmErr = lines.filter((l) => /^npm (error|ERR!)/i.test(l)).map((l) => l.replace(/^npm (error|ERR!)\s*/i, ''))
  const text = (npmErr.length ? npmErr : lines).join(' | ').slice(0, 1500)
  return text || (res.error ? String(res.error.message) : `npm termino con codigo ${res.status} sin salida`)
}

/** Errores del intento directo que justifican caer a staging (politica, no un fallo real). */
export function needsStaging(msg) {
  return /E_STAGE_REQUIRED|staging area|stage publish|\bE40[134]\b|\b40[134]\b/i.test(msg)
}

export function alreadyPublishedError(msg) {
  return /cannot publish over the previously published version/i.test(msg)
}

/** Dist-tag requerido por npm para prereleases (1.2.0-next.3 -> next). */
export function distTag(version) {
  const m = /-([0-9A-Za-z]+)/.exec(version)
  return m ? m[1] : undefined
}

/** Orden topologico (dependencias internas primero); tolera ciclos. */
export function sortByDeps(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.name, p]))
  const done = new Set()
  const visiting = new Set()
  const out = []
  const visit = (p) => {
    if (done.has(p.name) || visiting.has(p.name)) return
    visiting.add(p.name)
    const deps = Object.keys({ ...p.dependencies, ...p.optionalDependencies, ...p.peerDependencies })
    for (const d of deps.sort()) if (byName.has(d)) visit(byName.get(d))
    visiting.delete(p.name)
    done.add(p.name)
    out.push(p)
  }
  for (const p of [...pkgs].sort((a, b) => a.name.localeCompare(b.name))) visit(p)
  return out
}

function collectStages(node, acc = []) {
  if (Array.isArray(node)) node.forEach((n) => collectStages(n, acc))
  else if (node && typeof node === 'object') {
    if (typeof node.version === 'string') acc.push(node)
    else Object.values(node).forEach((n) => collectStages(n, acc))
  }
  return acc
}

/** Paquetes publicos del workspace, con sus dependencias leidas de package.json. */
export function listPackages(run) {
  const r = run('pnpm', ['-r', 'ls', '--depth', '-1', '--json'])
  const json = r.status === 0 ? parseJson(r.stdout) : undefined
  if (!Array.isArray(json)) throw new Error(`no pude listar el workspace: ${npmErrorMessage(r)}`)
  return json
    .filter((p) => p.name && p.version && !p.private)
    .filter((p, i, a) => a.findIndex((q) => q.name === p.name) === i)
    .map((p) => {
      const m = JSON.parse(readFileSync(join(p.path, 'package.json'), 'utf8'))
      return { ...p, dependencies: m.dependencies, optionalDependencies: m.optionalDependencies, peerDependencies: m.peerDependencies }
    })
}

export function main({
  run = defaultRun,
  log = console.log,
  summaryFile = process.env.GITHUB_STEP_SUMMARY,
  dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run'),
  packages,
  stageToken = process.env.NPM_STAGE_TOKEN,
} = {}) {
  const pkgs = sortByDeps(packages ?? listPackages(run))
  const direct = []
  const staged = []
  const pending = []
  const published = []
  const failed = []

  for (const pkg of pkgs) {
    const id = `${pkg.name}@${pkg.version}`
    // 1) ya publicada? (misma comprobacion que `changeset publish`)
    const view = run('npm', ['view', id, 'version', '--json'])
    const viewOut = `${view.stdout}\n${view.stderr}`
    if (view.status === 0 && String(view.stdout).trim() !== '') {
      published.push(id)
      log(`= ${id} ya publicado, omitido`)
      continue
    }
    if (view.status !== 0 && !/E404|404 Not Found|is not in this registry/i.test(viewOut)) {
      const msg = npmErrorMessage(view)
      failed.push({ id, step: 'npm view', msg })
      log(`x ${id} no pude consultar el registro: ${msg}`)
      continue
    }

    // 2) ya hay etapa pendiente?
    const list = run('npm', ['stage', 'list', pkg.name, '--json'])
    if (list.status === 0) {
      const mine = collectStages(parseJson(list.stdout)).filter(
        (s) => s.version === pkg.version && !DEAD_STATUSES.has(String(s.status ?? '').toLowerCase()),
      )
      if (mine.length) {
        const stageId = mine[0].stageId ?? mine[0].id
        pending.push({ id, stageId, status: mine[0].status })
        log(`= ${id} ya tiene etapa pendiente (${stageId ?? '?'}, ${mine[0].status ?? '?'}), omitido`)
        continue
      }
    } else {
      log(`! ${pkg.name}: 'npm stage list' fallo (${npmErrorMessage(list)}); continuo y preparo`)
    }

    if (dryRun) {
      log(`~ ${id} se prepararia (dry-run)`)
      continue
    }

    // 3) empaquetar (resuelve workspace:* y publishConfig) y preparar
    const dir = mkdtempSync(join(tmpdir(), 'stage-'))
    try {
      const pack = run('pnpm', ['pack', '--pack-destination', dir], { cwd: pkg.path })
      const tgz = pack.status === 0 ? readdirSync(dir).find((f) => f.endsWith('.tgz')) : undefined
      if (!tgz) {
        const msg = npmErrorMessage(pack)
        failed.push({ id, step: 'pnpm pack', msg })
        log(`x ${id} fallo el empaquetado: ${msg}`)
        continue
      }
      const tag = distTag(pkg.version)
      const tgzPath = join(dir, tgz)
      const extra = tag ? ['--tag', tag] : []

      // 1) intento directo (solo OIDC: entorno ambiente, sin NPM_STAGE_TOKEN)
      const pub = run('npm', ['publish', tgzPath, '--access', 'public', ...extra], { cwd: pkg.path })
      if (pub.status === 0 || alreadyPublishedError(npmErrorMessage(pub))) {
        direct.push(id)
        log(`+ ${id} publicado directo${pub.status === 0 ? '' : ' (ya estaba publicado)'}`)
        const t = run('git', ['tag', id])
        if (t.status === 0 || /already exists/i.test(`${t.stderr}`)) log(`New tag: ${id}`)
        else log(`! ${id}: no pude crear el tag git: ${npmErrorMessage(t)}`)
        continue
      }
      const directMsg = npmErrorMessage(pub)
      if (!needsStaging(directMsg)) {
        failed.push({ id, step: 'npm publish', msg: directMsg })
        log(`x ${id} fallo la publicacion directa: ${directMsg}`)
        continue
      }
      log(`~ ${id} publicacion directa no disponible (${directMsg}); preparo en staging`)

      // 2) fallback: staging, con token si existe
      const env = stageToken ? { NODE_AUTH_TOKEN: stageToken, NPM_TOKEN: stageToken } : undefined
      const res = run('npm', ['stage', 'publish', tgzPath, '--access', 'public', '--json', ...extra], { cwd: pkg.path, env })
      if (res.status !== 0) {
        const msg = npmErrorMessage(res)
        failed.push({ id, step: 'npm stage publish', msg: `${msg} (publicacion directa: ${directMsg})` })
        log(`x ${id} fallo al preparar: ${msg}`)
        continue
      }
      const json = parseJson(res.stdout) ?? {}
      const stageId = json.stageId ?? json.id ?? json.stage?.stageId
      staged.push({ id, stageId })
      log(`+ ${id} preparado en staging (stageId ${stageId ?? 'desconocido'})`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const lines = ['## Release npm', '']
  if (direct.length) {
    lines.push('### Publicados directo (OIDC)', '')
    direct.forEach((d) => lines.push('- `' + d + '`'))
    lines.push('')
  }
  if (staged.length) {
    lines.push('### Preparados (pendientes de aprobacion humana)', '', '| Paquete | stageId |', '|---|---|')
    staged.forEach((s) => lines.push(`| \`${s.id}\` | \`${s.stageId ?? '?'}\` |`))
    lines.push('', 'Aprobar con 2FA en npmjs.com -> Staged Packages (o `npm stage approve <stageId>`).', '')
  }
  if (pending.length) {
    lines.push('### Ya tenian etapa pendiente (no duplicados)', '')
    pending.forEach((s) => lines.push(`- \`${s.id}\` stageId \`${s.stageId ?? '?'}\` (${s.status ?? '?'})`))
    lines.push('')
  }
  if (failed.length) {
    lines.push('### Fallaron', '', '| Paquete | Paso | Mensaje de npm |', '|---|---|---|')
    failed.forEach((f) => lines.push(`| \`${f.id}\` | ${f.step} | ${f.msg.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`))
    lines.push('')
  }
  if (!direct.length && !staged.length && !pending.length && !failed.length) lines.push('Nada que preparar: todas las versiones ya estan publicadas.', '')
  lines.push(`Ya publicados (omitidos): ${published.length}`)
  const summary = lines.join('\n') + '\n'
  log('\n' + summary)
  if (summaryFile) {
    try { appendFileSync(summaryFile, summary) } catch (e) { log(`! no pude escribir el resumen: ${e.message}`) }
  }
  return { direct, staged, pending, published, failed, exitCode: failed.length ? 1 : 0 }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main().exitCode)
  } catch (e) {
    console.error(`publish-staged: ${e.message}`)
    process.exit(1)
  }
}
