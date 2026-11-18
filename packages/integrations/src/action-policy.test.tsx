// @vitest-environment happy-dom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ActionChain,
  ActionPolicyForm,
  EXAMPLE_TARGETS,
  InboundTab,
  WhenEditor,
  createMemoryIntegrationsApi,
  createT,
  flattenSchemaFields,
  guardColumns,
  inboundProblems,
  needsAdvanced,
  parseActions,
  whenProblems,
  MESSAGES,
  type ActionBlock,
  type Condition,
  type IngestTarget,
  type RecordBlock,
} from './index'

afterEach(cleanup)
const t = createT('en')
const items = EXAMPLE_TARGETS[0]!
const schema = {
  type: 'object',
  properties: {
    sku: { type: 'string', example: 'A-1' },
    quantity: { type: 'integer', example: 4 },
    updated_at: { type: 'string', format: 'date-time', example: '2026-01-15T10:30:00Z' },
    action: { type: 'string', example: 'created' },
  },
}
const fields = flattenSchemaFields(schema)
const out = () => JSON.parse(screen.getByTestId('out').textContent ?? 'null')

function PolicyHarness({ initial, target = items }: { initial: RecordBlock; target?: IngestTarget }) {
  const [a, setA] = React.useState<RecordBlock>(initial)
  return (
    <div>
      <ActionPolicyForm action={a} target={target} fields={fields} t={t} onChange={setA} />
      <pre data-testid="out">{JSON.stringify(a)}</pre>
    </div>
  )
}

const upsert = (extra: Record<string, unknown> = {}): RecordBlock =>
  ({ do: 'record.upsert', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, ...extra }) as RecordBlock
const del = (extra: Record<string, unknown> = {}): RecordBlock =>
  ({ do: 'record.delete', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, ...extra }) as RecordBlock

describe('guard editor', () => {
  it('suggests the server cursor and candidates, and writes {field, path, op}', () => {
    render(<PolicyHarness initial={upsert()} />)
    expect(guardColumns(items)).toMatchObject({ recommended: 'source_updated_at', suggested: ['source_updated_at', 'status'] })
    fireEvent.click(screen.getByRole('checkbox', { name: /newer than the saved record/ }))
    // enabling picks the recommended column, the likely event field and gte
    expect(out().guard).toEqual({ field: 'source_updated_at', path: 'payload.updated_at', op: 'gte' })
    const field = screen.getByLabelText('Record column with the date or version') as HTMLSelectElement
    const suggested = within(field).getAllByRole('option').map((o) => o.textContent)
    expect(suggested).toContain('source_updated_at (recommended)')
    expect(suggested).toContain('status')
    fireEvent.change(field, { target: { value: 'status' } })
    fireEvent.change(screen.getByLabelText('Event field with the date or version'), { target: { value: 'payload.sku' } })
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'gt' } })
    expect(out().guard).toEqual({ field: 'status', path: 'payload.sku', op: 'gt' })
    // plain-language help for the chosen operator
    expect(screen.getByText(/same date or version as the saved record is skipped/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'gte' } })
    expect(screen.getByText(/equal or newer than the saved record/)).toBeTruthy()
  })

  it('offers other date and number columns and removes the guard when switched off', () => {
    const tg: IngestTarget = { ...items, ingest_cursor: undefined, guard_candidates: [] }
    render(<PolicyHarness initial={upsert()} target={tg} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /newer than the saved record/ }))
    const options = within(screen.getByLabelText('Record column with the date or version')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('quantity') // number column
    expect(options).not.toContain('sku') // text column is no cursor
    fireEvent.click(screen.getByRole('checkbox', { name: /newer than the saved record/ }))
    expect('guard' in out()).toBe(false)
  })

  it('flags a guard column the model does not allow and an incomplete guard', () => {
    render(<PolicyHarness initial={upsert({ guard: { field: 'sku', path: 'payload.updated_at', op: 'gte' } })} />)
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toContain('cannot be used as an order guard')
    expect(inboundProblems([upsert({ guard: { field: 'sku', path: 'payload.x', op: 'gte' } })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('guardFieldNotAllowed')
    expect(inboundProblems([upsert({ guard: { field: '', path: '', op: 'gte' } })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('guardIncomplete')
    expect(inboundProblems([upsert({ guard: { field: 'status', path: 'event.x', op: 'gte' } })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('guardPathInvalid')
  })
})

describe('defaults and idempotency', () => {
  it('adds typed constants chosen among the writable columns not mapped', () => {
    render(<PolicyHarness initial={upsert()} />)
    const add = screen.getByLabelText('Add a fixed value…') as HTMLSelectElement
    const cols = within(add).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(cols).not.toContain('sku') // already mapped
    fireEvent.change(add, { target: { value: 'quantity' } })
    expect(out().defaults).toEqual({ quantity: 0 })
    fireEvent.change(screen.getByLabelText('Value · quantity'), { target: { value: '7' } })
    expect(out().defaults).toEqual({ quantity: 7 })
    fireEvent.change(screen.getByLabelText('Add a fixed value…'), { target: { value: 'status' } })
    expect(out().defaults).toEqual({ quantity: 7, status: 'active' })
    fireEvent.change(screen.getByLabelText('Value · status'), { target: { value: 'archived' } })
    expect(out().defaults.status).toBe('archived')
    fireEvent.click(screen.getByRole('button', { name: 'Remove · quantity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove · status' }))
    expect('defaults' in out()).toBe(false)
  })

  it('blocks a default that is not a column, has the wrong type or is also mapped', () => {
    const codes = (d: Record<string, unknown>, mapping: Record<string, string> = { sku: '{{payload.sku}}' }) =>
      inboundProblems([upsert({ defaults: d, mapping })], EXAMPLE_TARGETS).map((p) => p.code)
    expect(codes({ ghost: 1 })).toContain('defaultColumn')
    expect(codes({ quantity: 'abc' })).toContain('defaultType')
    expect(codes({ status: 'nope' })).toContain('defaultType')
    expect(codes({ quantity: 3 }, { sku: '{{payload.sku}}', quantity: '{{payload.quantity}}' })).toContain('defaultMapped')
    expect(codes({ quantity: 3, status: 'active' })).toEqual([])
  })

  it('record.create asks for a free text column as idempotency_field', () => {
    const create = { do: 'record.create', model: 'inventory.items', idempotency_field: '', mapping: { sku: '{{payload.sku}}' } } as RecordBlock
    render(<PolicyHarness initial={create} />)
    const sel = screen.getByLabelText('Column that stores the retry key') as HTMLSelectElement
    const opts = within(sel).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(opts).toContain('warehouse')
    expect(opts).not.toContain('sku') // mapped
    expect(opts).not.toContain('quantity') // not text
    expect(opts).not.toContain('status') // has options
    fireEvent.change(sel, { target: { value: 'warehouse' } })
    expect(out().idempotency_field).toBe('warehouse')
    const bad = (f: string, mapping: Record<string, string> = { sku: '{{payload.sku}}' }) =>
      inboundProblems([{ ...create, idempotency_field: f, mapping }], EXAMPLE_TARGETS).map((p) => p.code)
    expect(bad('sku')).toContain('idempotencyInvalid')
    expect(bad('quantity')).toContain('idempotencyInvalid')
    expect(bad('ghost')).toContain('idempotencyInvalid')
    expect(bad('warehouse')).not.toContain('idempotencyInvalid')
  })
})

describe('record.delete', () => {
  it('is always soft: no hard option, a notice, max_rows 1..100 and a guard', () => {
    render(<PolicyHarness initial={del()} />)
    expect(screen.getByTestId('soft-delete-note').textContent).toContain('The delete is logical')
    expect(screen.queryByText(/hard/i)).toBeNull()
    expect(screen.queryByRole('option', { name: /hard/i })).toBeNull()
    expect(screen.getByLabelText('Maximum rows affected')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '5' } })
    expect(out().max_rows).toBe(5)
    expect('mode' in out()).toBe(false)
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '101' } })
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toContain('between 1 and 100')
    expect(inboundProblems([del({ max_rows: 101 })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('maxRows')
    expect(inboundProblems([del({ max_rows: 0 })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('maxRows')
    expect(inboundProblems([del({ max_rows: 100 })], EXAMPLE_TARGETS).map((p) => p.code)).not.toContain('maxRows')
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '' } })
    expect('max_rows' in out()).toBe(false)
    expect(screen.getByTestId('guard-editor')).toBeTruthy()
    expect(screen.queryByTestId('defaults-editor')).toBeNull()
  })

  it('keeps mode soft untouched and rejects anything else', () => {
    render(<PolicyHarness initial={del({ mode: 'soft' })} />)
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '2' } })
    expect(out().mode).toBe('soft')
    expect(needsAdvanced(del({ mode: 'hard' }) as ActionBlock, { targets: true })).toBe(true)
    expect(inboundProblems([del({ mode: 'hard' })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('deleteMode')
  })
})

describe('record.action', () => {
  const act = (extra: Record<string, unknown> = {}) =>
    ({ do: 'record.action', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, action: '', ...extra }) as RecordBlock

  it('offers only the actions the server declares and renders their params', () => {
    render(<PolicyHarness initial={act()} />)
    const sel = screen.getByLabelText('Action to run') as HTMLSelectElement
    expect(within(sel).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'reserve'])
    expect(screen.queryByTestId('action-params')).toBeNull()
    fireEvent.change(sel, { target: { value: 'reserve' } })
    expect(out().action).toBe('reserve')
    expect(screen.getByText('Only for records in state: active')).toBeTruthy()
    const params = within(screen.getByTestId('action-params'))
    expect(params.getByText('Cantidad (quantity)')).toBeTruthy()
    expect(params.getByText('Motivo (reason)')).toBeTruthy()
    // required param unset -> blocks
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toContain('"quantity" is required')
    expect(inboundProblems([out()], EXAMPLE_TARGETS).map((p) => p.code)).toContain('paramRequired')
    fireEvent.change(screen.getByLabelText('Source · quantity'), { target: { value: 'field' } })
    fireEvent.change(screen.getByLabelText('Event field · quantity'), { target: { value: 'quantity' } })
    expect(out().params).toEqual({ quantity: '{{payload.quantity}}' })
    fireEvent.change(screen.getByLabelText('Source · reason'), { target: { value: 'literal' } })
    fireEvent.change(screen.getByLabelText('Fixed text · reason'), { target: { value: 'sold' } })
    expect(out().params).toEqual({ quantity: '{{payload.quantity}}', reason: 'sold' })
    expect(inboundProblems([out()], EXAMPLE_TARGETS).map((p) => p.code)).toEqual([])
    // changing the action drops the params of the previous one
    fireEvent.change(sel, { target: { value: '' } })
    expect('params' in out()).toBe(false)
  })

  it('on_ineligible explains noop vs fail', () => {
    render(<PolicyHarness initial={act({ action: 'reserve' })} />)
    expect(screen.getByText(/noop: it was already in that state/)).toBeTruthy()
    const sel = screen.getByLabelText('If the record is not in an eligible state') as HTMLSelectElement
    expect(sel.value).toBe('noop')
    fireEvent.change(sel, { target: { value: 'fail' } })
    expect(out().on_ineligible).toBe('fail')
  })

  it('flags an action the server does not offer and undeclared params, keeping them removable', () => {
    render(<PolicyHarness initial={act({ action: 'refund' })} />)
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toContain('"refund" is not available')
    expect(inboundProblems([act({ action: 'refund' })], EXAMPLE_TARGETS).map((p) => p.code)).toContain('actionUnavailable')
    const withExtra = act({ action: 'reserve', params: { quantity: '1', ghost: 'x' } })
    expect(inboundProblems([withExtra], EXAMPLE_TARGETS).map((p) => p.code)).toContain('paramUnknown')
    cleanup()
    render(<PolicyHarness initial={withExtra} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove · ghost' }))
    expect(out().params).toEqual({ quantity: '1' })
  })

  it('says so when the model declares no action', () => {
    render(<PolicyHarness initial={act()} target={{ ...items, actions_available: undefined }} />)
    expect(screen.getByText(/declares no action/)).toBeTruthy()
  })
})

describe('record.transition and record.restore', () => {
  const tr = (to = '') => ({ do: 'record.transition', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, to }) as RecordBlock
  const staged: IngestTarget = {
    ...items,
    stage: {
      field: 'status',
      stages: [{ key: 'draft' }, { key: 'active', label: 'Activo' }, { key: 'archived' }],
      transitions: [
        { from: 'draft', to: 'active' },
        { from: 'active', to: 'archived' },
      ],
    },
  }

  it('only allows states reached by a declared transition; the others are disabled', () => {
    render(<PolicyHarness initial={tr()} target={staged} />)
    const sel = screen.getByLabelText('Move to state (column status)') as HTMLSelectElement
    const byKey = Object.fromEntries(within(sel).getAllByRole('option').map((o) => [o.getAttribute('value'), (o as HTMLOptionElement).disabled]))
    expect(byKey).toEqual({ '': false, draft: true, active: false, archived: false })
    fireEvent.change(sel, { target: { value: 'archived' } })
    expect(out().to).toBe('archived')
    expect(screen.getByText('Allowed from: active')).toBeTruthy()
    expect(inboundProblems([tr('archived')], [staged]).map((p) => p.code)).toEqual([])
    expect(inboundProblems([tr('draft')], [staged]).map((p) => p.code)).toContain('transitionInvalid')
    expect(inboundProblems([tr('ghost')], [staged]).map((p) => p.code)).toContain('transitionInvalid')
  })

  it('warns for a model without a state machine and offers max_rows', () => {
    render(<PolicyHarness initial={tr()} target={{ ...items, stage: null }} />)
    expect(screen.getByText(/no state machine/)).toBeTruthy()
    expect(screen.getByLabelText('Maximum rows affected')).toBeTruthy()
    expect(inboundProblems([tr('x')], [{ ...items, stage: null }]).map((p) => p.code)).toContain('transitionInvalid')
  })

  it('record.restore only has max_rows', () => {
    render(<PolicyHarness initial={{ do: 'record.restore', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' } }} />)
    expect(screen.getByLabelText('Maximum rows affected')).toBeTruthy()
    expect(screen.queryByTestId('guard-editor')).toBeNull()
    expect(screen.queryByTestId('defaults-editor')).toBeNull()
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '3' } })
    expect(out().max_rows).toBe(3)
  })

  it('select-only blocks must map exactly their match columns', () => {
    const codes = (m: Record<string, string>) => inboundProblems([{ ...tr('archived'), mapping: m } as ActionBlock], [items]).map((p) => p.code)
    expect(codes({ sku: '{{payload.sku}}', quantity: '1' })).toContain('mappingNotMatch')
    expect(codes({})).toEqual(expect.arrayContaining(['mappingEmpty', 'matchUnmapped']))
  })
})

describe('WhenEditor', () => {
  function WhenHarness({ initial }: { initial?: Condition }) {
    const [w, setW] = React.useState<Condition | undefined>(initial)
    return (
      <form onSubmit={(e) => e.preventDefault()}>
        <WhenEditor value={w} onChange={setW} fields={fields} t={t} />
        <pre data-testid="out">{JSON.stringify(w ?? null)}</pre>
      </form>
    )
  }

  it('never offers exists and builds eq / ne / in from event fields', () => {
    render(<WhenHarness />)
    const op = screen.getByLabelText('Condition') as HTMLSelectElement
    expect(within(op).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'eq', 'ne', 'in'])
    expect(screen.queryByRole('option', { name: /exist/i })).toBeNull()
    fireEvent.change(op, { target: { value: 'eq' } })
    fireEvent.change(screen.getByLabelText('Event field'), { target: { value: 'payload.action' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'created' } })
    expect(out()).toEqual({ path: 'payload.action', eq: 'created' })
    expect(screen.getByTestId('when-phrase').textContent).toBe('Runs when payload.action is created')
    fireEvent.change(op, { target: { value: 'ne' } })
    expect(out()).toEqual({ path: 'payload.action', ne: 'created' })
    fireEvent.change(op, { target: { value: '' } })
    expect(out()).toBeNull()
  })

  it('in: needs 1 to 50 scalar values, shows the sentence, Enter does not submit', () => {
    render(<WhenHarness initial={{ path: 'payload.action', in: [] }} />)
    expect(screen.getByRole('alert').textContent).toBe('Add at least one value.')
    expect(whenProblems({ when: { path: 'payload.action', in: [] } })).toHaveLength(1)
    const box = screen.getByLabelText('New value')
    fireEvent.change(box, { target: { value: 'created' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(out()).toEqual({ path: 'payload.action', in: ['created', 'updated'] })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('when-phrase').textContent).toBe('Runs when payload.action is created or updated')
    // duplicates are ignored; values can be removed
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'created' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(out().in).toEqual(['created', 'updated'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove created' }))
    expect(out().in).toEqual(['updated'])
  })

  it('in: refuses the 51st value and validates the list on save', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `v${i}`)
    render(<WhenHarness initial={{ path: 'payload.action', in: fifty }} />)
    expect((screen.getByRole('button', { name: 'Add value' }) as HTMLButtonElement).disabled).toBe(true)
    expect(whenProblems({ when: { path: 'payload.action', in: fifty } })).toEqual([])
    expect(whenProblems({ when: { path: 'payload.action', in: [...fifty, 'x'] } })).toHaveLength(1)
    expect(whenProblems({ when: { path: '', eq: 'a' } })).toHaveLength(1)
    expect(whenProblems({ when: { path: 'p', eq: '' } })).toHaveLength(1)
    expect(whenProblems({ when: { path: 'p', exists: true } })).toHaveLength(1)
    expect(whenProblems({ when: { path: 'p', eq: false } })).toEqual([])
    expect(whenProblems({ when: { path: 'p', in: [1, 'a', true] } })).toEqual([])
  })

  it('keeps types: numbers and booleans are scalars, string fields stay text', () => {
    render(<WhenHarness initial={{ path: 'payload.quantity', eq: 1 }} />)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '5' } })
    expect(out()).toEqual({ path: 'payload.quantity', eq: 5 })
    cleanup()
    render(<WhenHarness initial={{ path: 'payload.sku', eq: 'a' }} />)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '5' } })
    expect(out()).toEqual({ path: 'payload.sku', eq: '5' })
  })

  it('falls back to a typed path for a path outside the example event and can go back', () => {
    render(<WhenHarness initial={{ path: 'result.created', eq: true }} />)
    const input = screen.getByLabelText('Event path (e.g. payload.action)') as HTMLInputElement
    expect(input.value).toBe('result.created')
    fireEvent.click(screen.getByRole('button', { name: 'Pick from list' }))
    expect(screen.getByLabelText('Event field')).toBeTruthy()
  })

  it('exists is shown as advanced-only and never edited', () => {
    expect(needsAdvanced({ do: 'notify', template: 'x', when: { path: 'p', exists: true } })).toBe(true)
  })
})

describe('ActionChain integration', () => {
  function Chain({ initial, targets = EXAMPLE_TARGETS }: { initial: ActionBlock[]; targets?: IngestTarget[] | null }) {
    const [actions, setActions] = React.useState<ActionBlock[]>(initial)
    return (
      <div>
        <ActionChain actions={actions} onChange={setActions} options={targets ? { targets } : undefined} contractSchema={schema} t={t} />
        <pre data-testid="out">{JSON.stringify(actions)}</pre>
      </div>
    )
  }

  it('edits a rich record.delete visually (no advanced-only notice) and keeps unknown fields', () => {
    const block = {
      do: 'record.delete',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}' },
      mode: 'soft',
      max_rows: 2,
      guard: { field: 'source_updated_at', path: 'payload.updated_at', op: 'gte' },
      when: { path: 'payload.action', eq: 'deleted' },
      scope: { branch: 'payload.branch' }, // a field this editor does not know
    } as unknown as ActionBlock
    // parseActions never invents or drops what it understands (round trip)
    expect(parseActions([{ ...block, scope: undefined }])).toEqual({ ok: true, actions: [{ ...block, scope: undefined }].map(({ scope: _s, ...r }) => r) })
    render(<Chain initial={[block]} />)
    expect(screen.queryByText('This block is edited in the advanced view (JSON).')).toBeNull()
    expect((screen.getByLabelText('Maximum rows affected') as HTMLInputElement).value).toBe('2')
    fireEvent.change(screen.getByLabelText('Maximum rows affected'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'gt' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'removed' } })
    expect(out()[0]).toEqual({
      ...(block as object),
      max_rows: 3,
      guard: { field: 'source_updated_at', path: 'payload.updated_at', op: 'gt' },
      when: { path: 'payload.action', eq: 'removed' },
    })
    // the read-only JSON backup reflects the block
    expect(screen.getByTestId('block-json').textContent).toContain('"max_rows": 3')
  })

  it('keeps exists-conditions and non-soft modes in the advanced-only view', () => {
    const block = { do: 'record.delete', model: 'inventory.items', match: ['sku'], mapping: {}, when: { path: 'payload.x', exists: true } } as unknown as ActionBlock
    render(<Chain initial={[block]} />)
    expect(screen.getByText('This block is edited in the advanced view (JSON).')).toBeTruthy()
    expect(screen.queryByTestId('action-policy')).toBeNull()
  })

  it('without listTargets (old hosts) nothing changes: legacy kinds and no policy form', () => {
    render(<Chain initial={[{ do: 'record.upsert', model: 'customers', match: ['id'], mapping: {} }]} targets={null} />)
    expect(screen.queryByTestId('action-policy')).toBeNull()
    const kinds = within(screen.getByLabelText('Add action', { selector: 'select' })).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(kinds).toEqual(['record.upsert', 'event.emit', 'notify', 'command.run'])
    // the new `when` editor still works there (free path, no example fields needed)
    expect(screen.getByTestId('when-editor')).toBeTruthy()
  })

  it('with listTargets every record kind can be added; changing the model clears the policy', () => {
    render(<Chain initial={[]} />)
    const kinds = within(screen.getByLabelText('Add action', { selector: 'select' })).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(kinds).toHaveLength(10)
    expect(kinds).toContain('record.transition')
  })

  it('select-only blocks map just the match columns', () => {
    const block = { do: 'record.transition', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, to: 'archived' } as unknown as ActionBlock
    render(<Chain initial={[block]} />)
    expect(screen.getByLabelText('Source · sku')).toBeTruthy()
    expect(screen.queryByLabelText('Source · quantity')).toBeNull()
  })
})

describe('InboundTab blocks saving on policy problems', () => {
  const contracts = [{ key: 'stock', name: 'Stock', schema }]
  const base = (extra: Record<string, unknown>) =>
    ({
      id: 'in_1',
      name: 'Stock',
      contract_key: 'stock',
      on_error: 'stop' as const,
      enabled: true,
      actions: [{ do: 'record.upsert', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, ...extra }] as ActionBlock[],
    })

  async function open(inbound: ReturnType<typeof base>) {
    const api = createMemoryIntegrationsApi({ contracts, inbound: [inbound] })
    render(<InboundTab api={api} t={t} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await screen.findByLabelText('Name')
    await screen.findByTestId('action-policy')
    return api
  }

  it('an incomplete when blocks the save, with a clear message', async () => {
    const api = await open(base({ when: { path: 'payload.action', in: [] } }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const list = screen.getAllByRole('alert').map((x) => x.textContent).join(' ')
    expect(list).toContain('The condition is incomplete: Add at least one value.')
    expect(api.calls).not.toContain('saveInbound')
  })

  it('a guard without a column blocks the save; fixing it saves exactly {field,path,op}', async () => {
    const api = await open(base({ guard: { field: '', path: '', op: 'gte' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toContain('The order guard needs a column and an event field.')
    expect(api.calls).not.toContain('saveInbound')
    fireEvent.change(screen.getByLabelText('Record column with the date or version'), { target: { value: 'source_updated_at' } })
    fireEvent.change(screen.getByLabelText('Event field with the date or version'), { target: { value: 'payload.updated_at' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.calls).toContain('saveInbound'))
  })
})

describe('i18n', () => {
  it('es and en define exactly the same keys, none empty', () => {
    const en = Object.keys(MESSAGES.en).sort()
    const es = Object.keys(MESSAGES.es).sort()
    expect(es).toEqual(en)
    for (const k of en) {
      expect(MESSAGES.en[k as keyof typeof MESSAGES.en]).not.toBe('')
      expect(MESSAGES.es[k as keyof typeof MESSAGES.es]).not.toBe('')
    }
    expect(en.filter((k) => k.startsWith('policy.') || k.startsWith('when.')).length).toBeGreaterThan(60)
  })

  it('renders the policy in Spanish', () => {
    const es = createT('es')
    render(<ActionPolicyForm action={del()} target={items} fields={fields} t={es} onChange={() => {}} />)
    expect(screen.getByText(/El borrado es lógico/)).toBeTruthy()
    expect(screen.getByLabelText('Máximo de filas afectadas')).toBeTruthy()
  })
})

describe('accessibility', () => {
  it('controls are labelled and grouped', () => {
    render(<PolicyHarness initial={upsert({ guard: { field: 'status', path: 'payload.updated_at', op: 'gte' } })} />)
    expect(screen.getByRole('group', { name: 'Rules of this step' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Ignore old events' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Fixed values' })).toBeTruthy()
    // every select/input/button has an accessible name
    for (const el of [...screen.getAllByRole('combobox'), ...screen.getAllByRole('checkbox'), ...screen.queryAllByRole('button')]) {
      expect(el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.length || el.textContent).toBeTruthy()
    }
    const op = screen.getByLabelText('Comparison')
    expect(op.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('keyboard: the value list of in is operable without a mouse', () => {
    function H() {
      const [w, setW] = React.useState<Condition | undefined>({ path: 'payload.action', in: ['a'] })
      return (
        <>
          <WhenEditor value={w} onChange={setW} fields={fields} t={t} />
          <pre data-testid="out">{JSON.stringify(w)}</pre>
        </>
      )
    }
    render(<H />)
    const box = screen.getByLabelText('New value')
    fireEvent.change(box, { target: { value: 'b' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(out().in).toEqual(['a', 'b'])
    expect(screen.getByRole('list', { name: 'Accepted values' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove a' })).toBeTruthy()
  })
})
