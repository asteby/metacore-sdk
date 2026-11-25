#!/usr/bin/env node
// Genera packages/sdk/src/generated/support-contract.ts a partir de los fixtures
// dorados del contrato de soporte (metacore-kernel: support/contract/testdata).
//
//   node scripts/gen-support-types.mjs --src <dir-testdata>          # escribe
//   node scripts/gen-support-types.mjs --src <dir-testdata> --check  # falla si el archivo difiere
//
// <dir-testdata> tambien puede venir en SUPPORT_CONTRACT_TESTDATA. No se copian a mano:
// los tipos se infieren de los JSON. Un campo es opcional cuando falta en alguno de los
// fixtures de su familia; los campos de enumeracion se emiten como union de los valores
// observados mas `string` (los receptores deben tolerar valores desconocidos).
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const OUT = join(ROOT, 'packages/sdk/src/generated/support-contract.ts')

/** Familia de tipos -> prefijos de fixtures que la alimentan. */
export const FAMILIES = [
  ['SupportEscalateRequest', ['escalate_request_']],
  ['SupportEscalateResponse', ['escalate_response_']],
  ['SupportMessageRequest', ['message_request_']],
  ['SupportMessageResponse', ['message_response']],
  ['SupportLinkRequest', ['link_request']],
  ['SupportLinkResponse', ['link_response_']],
  ['SupportLinkAckRequest', ['link_ack_request']],
  ['SupportCallbackEvent', ['callback_']],
  ['SupportDeskIngestEvent', ['desk_']],
  ['SupportErrorBody', ['error_']],
  ['SupportCaseView', ['thread_case']],
  ['SupportMessageView', ['thread_message']],
  ['SupportEmbedSessionClaims', ['embed_session_claims']],
  ['SupportPublicProfile', ['public_profile']],
  ['SupportVisitorErasedEvent', ['visitor_erased']],
]

/** Ruta dentro de una familia -> nombre de tipo compartido (se fusionan entre familias). */
export const NAMED = {
  'SupportCallbackEvent.attachments[]': 'SupportAttachment',
  'SupportMessageRequest.attachments[]': 'SupportAttachment',
  'SupportDeskIngestEvent.message.attachments[]': 'SupportAttachment',
  'SupportDeskIngestEvent.case': 'SupportDeskCase',
  'SupportDeskIngestEvent.message': 'SupportDeskMessage',
  'SupportDeskIngestEvent.case.instance_context': 'SupportInstanceContext',
  'SupportDeskIngestEvent.case.instance_context.recent_incidents[]': 'SupportIncidentRef',
  'SupportEscalateRequest.transcript[]': 'SupportTranscriptTurn',
  'SupportEscalateRequest.attachments[]': 'SupportAttachmentRef',
  'SupportEscalateRequest.ticket': 'SupportTicket',
  'SupportEscalateRequest.source': 'SupportSource',
  'SupportEscalateResponse.case': 'SupportCaseRef',
  'SupportEscalateResponse.link': 'SupportLinkSummary',
  'SupportLinkResponse.link': 'SupportLinkInfo',
  // Vistas del hilo: CaseView.messages[] y MessageView son el mismo tipo.
  'SupportCaseView.messages[]': 'SupportMessageView',
  SupportMessageView: 'SupportMessageView',
  'SupportCaseView.messages[].attachments[]': 'SupportAttachment',
  'SupportMessageView.attachments[]': 'SupportAttachment',
  'SupportDeskIngestEvent.case.channel': 'SupportChannelRef',
  'SupportVisitorErasedEvent.channel': 'SupportChannelRef',
  'SupportDeskIngestEvent.case.requester': 'SupportRequester',
  'SupportPublicProfile.fallback_contact': 'SupportFallbackContact',
}

/** Rutas cuyo objeto es un mapa clave libre -> valor (p. ej. textos por idioma). */
export const MAPS = new Set(['SupportPublicProfile.texts'])

/**
 * Campos opcionales que un solo fixture no puede mostrar (el contrato los marca omitempty en Go:
 * support/contract/channels.go y profile.go). Ruta = la del tipo que los contiene.
 */
const CV = 'SupportCaseView'
const MV = 'SupportCaseView.messages[]'
const PP = 'SupportPublicProfile'
export const OPTIONAL = new Set([
  ...['case_id', 'channel', 'description', 'severity', 'hub_state', 'solution', 'opened_at', 'updated_at', 'resolved_at', 'messages_older_cursor'].map((f) => `${CV}.${f}`),
  ...['author_name', 'attachments'].map((f) => `${MV}.${f}`),
  `${MV}.attachments[].content_type`,
  'SupportDeskIngestEvent.case.requester.email',
  ...['version', 'brand_color', 'appearance', 'position', 'logo_url', 'default_locale', 'texts', 'fallback_contact'].map((f) => `${PP}.${f}`),
  ...['launcher', 'greeting', 'offline'].map((f) => `${PP}.texts.*.${f}`),
  ...['email', 'url'].map((f) => `${PP}.fallback_contact.${f}`),
  'SupportVisitorErasedEvent.case_ids',
  'SupportVisitorErasedEvent.contract',
])

/** Campos cuyo valor es libre aunque el nombre este en ENUM_FIELDS (id publico, no enumeracion). */
const NOT_ENUM = new Set([`${CV}.channel`])

/** Campos string que se emiten como union de valores observados. */
const ENUM_FIELDS = new Set(['event', 'severity', 'role', 'author_type', 'type', 'status', 'state', 'source', 'channel', 'code', 'reason', 'priority', 'kind', 'appearance', 'position', 'hub_state'])

const prim = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)

function infer(v) {
  const t = prim(v)
  if (t === 'object') {
    const fields = new Map()
    for (const [k, x] of Object.entries(v)) fields.set(k, { shape: infer(x), count: 1 })
    return { t: 'object', n: 1, fields }
  }
  if (t === 'array') {
    let items = null
    for (const x of v) items = merge(items, infer(x))
    return { t: 'array', items }
  }
  return { t: 'prim', types: new Set([t]), values: new Set(t === 'string' ? [v] : []) }
}

function merge(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.t !== b.t) return { t: 'union', parts: [a, b] }
  if (a.t === 'prim') {
    return { t: 'prim', types: new Set([...a.types, ...b.types]), values: new Set([...a.values, ...b.values]) }
  }
  if (a.t === 'array') return { t: 'array', items: merge(a.items, b.items) }
  if (a.t === 'object') {
    const fields = new Map()
    for (const [k, f] of a.fields) fields.set(k, { shape: f.shape, count: f.count })
    for (const [k, f] of b.fields) {
      const cur = fields.get(k)
      fields.set(k, cur ? { shape: merge(cur.shape, f.shape), count: cur.count + f.count } : { shape: f.shape, count: f.count })
    }
    return { t: 'object', n: a.n + b.n, fields }
  }
  return { t: 'union', parts: [a, b] }
}

/** Fusiona los objetos con el mismo nombre compartido. */
function collectNamed(shape, path, reg) {
  if (!shape) return
  const name = NAMED[path]
  if (name && shape.t === 'object') reg.set(name, merge(reg.get(name) ?? null, shape))
  if (shape.t === 'object') for (const [k, f] of shape.fields) collectNamed(f.shape, `${path}.${k}`, reg)
  else if (shape.t === 'array') collectNamed(shape.items, `${path}[]`, reg)
}

const q = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k))

function emit(shape, path, ind, key) {
  if (!shape) return 'unknown'
  const name = NAMED[path]
  if (name && shape.t === 'object') return name
  switch (shape.t) {
    case 'prim': {
      const parts = []
      for (const t of [...shape.types].sort()) {
        if (t === 'string' && shape.values.size > 0 && ENUM_FIELDS.has(key) && !NOT_ENUM.has(path)) {
          parts.push(...[...shape.values].sort().map((s) => JSON.stringify(s)), '(string & {})')
        } else parts.push(t)
      }
      return parts.join(' | ')
    }
    case 'array': {
      const inner = emit(shape.items, `${path}[]`, ind, key)
      return /[|&]/.test(inner) ? `Array<${inner}>` : `${inner}[]`
    }
    case 'union':
      return shape.parts.map((p) => emit(p, path, ind, key)).join(' | ')
    case 'object': {
      if (MAPS.has(path)) {
        let values = null
        for (const f of shape.fields.values()) values = merge(values, f.shape)
        return `Record<string, ${emit(values, `${path}.*`, ind, key)}>`
      }
      return emitObject(shape, path, ind)
    }
  }
  return 'unknown'
}

function emitObject(shape, path, ind) {
  const pad = '  '.repeat(ind + 1)
  const lines = []
  for (const [k, f] of shape.fields) {
    const opt = f.count < shape.n || OPTIONAL.has(`${path}.${k}`) ? '?' : ''
    lines.push(`${pad}${q(k)}${opt}: ${emit(f.shape, `${path}.${k}`, ind + 1, k)}`)
  }
  return `{\n${lines.join('\n')}\n${'  '.repeat(ind)}}`
}

// Un tipo compartido se emite con su ruta original para que sus hijos nombrados se resuelvan.
const pathOf = (name) => Object.keys(NAMED).find((p) => NAMED[p] === name) ?? name

/** @param {Record<string, unknown>} files nombre de fixture (sin .json) -> contenido */
export function generate(files) {
  const names = Object.keys(files).sort()
  const used = new Set()
  const familyShapes = []
  for (const [family, prefixes] of FAMILIES) {
    let shape = null
    for (const n of names) {
      if (prefixes.some((p) => n.startsWith(p)) && !used.has(n)) {
        shape = merge(shape, infer(files[n]))
        used.add(n)
      }
    }
    if (shape) familyShapes.push([family, shape])
  }
  const ignored = names.filter((n) => !used.has(n))
  const reg = new Map()
  for (const [family, shape] of familyShapes) collectNamed(shape, family, reg)

  const hash = createHash('sha256')
  for (const n of names) hash.update(`${n}\n${JSON.stringify(files[n])}\n`)

  const out = []
  out.push('// GENERADO por scripts/gen-support-types.mjs. No editar a mano.')
  out.push('// Fuente: fixtures del contrato (metacore-kernel: support/contract/testdata).')
  out.push(`// Huella de los fixtures: sha256:${hash.digest('hex')}`)
  out.push(`// Fixtures usados: ${names.filter((n) => used.has(n)).join(', ')}`)
  if (ignored.length) out.push(`// Fixtures sin familia (ignorados): ${ignored.join(', ')}`)
  out.push('')
  for (const name of [...reg.keys()].sort()) {
    out.push(`export interface ${name} ${emitObject(reg.get(name), pathOf(name), 0)}`, '')
  }
  for (const [family, shape] of familyShapes) {
    if (reg.has(family)) continue // ya emitido como tipo compartido
    out.push(`export interface ${family} ${emitObject(shape, family, 0)}`, '')
  }
  const events = new Set()
  for (const n of used) {
    const f = files[n]
    if (f && typeof f === 'object' && typeof f.event === 'string') events.add(f.event)
  }
  out.push('/** Eventos observados en los fixtures. El contrato admite mas: los receptores responden 2xx a los desconocidos. */')
  out.push(`export const SUPPORT_FIXTURE_EVENTS = ${JSON.stringify([...events].sort())} as const`, '')
  return out.join('\n')
}

export function readFixtures(dir) {
  const files = {}
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    if (f === 'signature_vectors.json') continue
    files[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  }
  return files
}

function main(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const src = get('--src') ?? process.env.SUPPORT_CONTRACT_TESTDATA
  if (!src || !existsSync(src)) {
    console.error('Falta --src <dir testdata> (o SUPPORT_CONTRACT_TESTDATA) o no existe.')
    process.exit(2)
  }
  const next = generate(readFixtures(src))
  if (argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
    if (cur !== next) {
      console.error('support-contract.ts esta desalineado con los fixtures. Ejecuta: node scripts/gen-support-types.mjs --src <dir>')
      process.exit(1)
    }
    console.log('support-contract.ts alineado con los fixtures.')
    return
  }
  writeFileSync(OUT, next)
  console.log(`Escrito ${OUT}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
