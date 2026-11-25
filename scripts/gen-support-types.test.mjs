// Ejecutar: node --test scripts/gen-support-types.test.mjs
// Con SUPPORT_CONTRACT_TESTDATA=<dir> tambien comprueba que el archivo commiteado sigue alineado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { generate, readFixtures, OUT } from './gen-support-types.mjs'

test('un campo ausente en algun fixture de la familia es opcional', () => {
  const out = generate({
    callback_a: { event: 'desk_message', ticket_folio: 'X', body: 'hola' },
    callback_b: { event: 'desk_resolved', ticket_folio: 'X' },
  })
  assert.match(out, /event: "desk_message" \| "desk_resolved" \| \(string & \{\}\)/)
  assert.match(out, /ticket_folio: string/)
  assert.match(out, /body\?: string/)
})

test('los adjuntos de familias distintas se fusionan en un solo tipo compartido', () => {
  const out = generate({
    callback_a: { event: 'e', attachments: [{ url: 'u', content_type: 'image/png' }] },
    message_request_v2: { ticket: { folio: 'f' }, attachments: [{ url: 'u', mime_type: 'image/png' }] },
  })
  assert.equal(out.match(/export interface SupportAttachment /g)?.length, 1)
  assert.match(out, /content_type\?: string/)
  assert.match(out, /mime_type\?: string/)
  assert.match(out, /attachments: SupportAttachment\[\]/)
})

test('es determinista y cambia la huella cuando cambia un fixture', () => {
  const a = { callback_a: { event: 'e' } }
  assert.equal(generate(a), generate({ callback_a: { event: 'e' } }))
  assert.notEqual(generate(a), generate({ callback_a: { event: 'f' } }))
})

test('el archivo commiteado coincide con los fixtures (si hay SUPPORT_CONTRACT_TESTDATA)', (t) => {
  const dir = process.env.SUPPORT_CONTRACT_TESTDATA
  if (!dir || !existsSync(dir)) return t.skip('sin SUPPORT_CONTRACT_TESTDATA')
  assert.equal(readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'), generate(readFixtures(dir)))
})

test('las vistas del hilo comparten MessageView, los campos omitempty son opcionales y los textos son un mapa', () => {
  const out = generate({
    thread_case: { case_id: 'c', folio: 'F', channel: 'sch_X', status: 'open', messages: [{ id: '1', author_type: 'reporter', body: 'b', created_at: 't' }] },
    thread_message: { id: '2', author_type: 'agent', body: 'b', created_at: 't' },
    public_profile: { brand_color: '#000000', texts: { 'es-MX': { launcher: 'a' }, 'en-US': { launcher: 'b' } } },
  })
  assert.equal(out.match(/export interface SupportMessageView /g)?.length, 1)
  assert.match(out, /messages: SupportMessageView\[\]/)
  assert.match(out, /case_id\?: string/)
  assert.match(out, /channel\?: string/)
  assert.match(out, /texts\?: Record<string, \{/)
})
