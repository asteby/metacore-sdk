// @vitest-environment happy-dom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ActionChain,
  EXAMPLE_TARGETS,
  InboundTab,
  MappingEditor,
  TargetPicker,
  createMemoryIntegrationsApi,
  createT,
  groupTargets,
  inboundProblems,
  suggestSource,
  targetBlockedReason,
  validateRecord,
  type ActionBlock,
  type IngestTarget,
  type MappingRow,
} from './index'

afterEach(cleanup)
const t = createT('en')
const items = EXAMPLE_TARGETS[0]!
const crm: IngestTarget = {
  ...items,
  addon: 'crm',
  addon_name: 'CRM',
  model: 'crm.contacts',
  label: 'Contactos',
  columns: [{ name: 'email', label: 'Correo', type: 'text', required: true, unique: true }],
  match_candidates: [['email']],
  permissions: { create: false, update: false, delete: false },
}
const contractSchema = {
  type: 'object',
  properties: { sku: { type: 'string', example: 'A-1' }, quantity: { type: 'integer', example: 4 }, state: { type: 'string', example: 'active' } },
}

function Picker({ targets = EXAMPLE_TARGETS, kind = 'record.upsert', onPick }: { targets?: IngestTarget[]; kind?: string; onPick?: (m: string) => void }) {
  const [v, setV] = React.useState('')
  return (
    <TargetPicker
      targets={targets}
      value={v}
      kind={kind}
      t={t}
      onChange={(m) => {
        setV(m)
        onPick?.(m)
      }}
    />
  )
}

describe('target helpers', () => {
  it('only offers what the server declares, grouped by addon and searchable', () => {
    expect(groupTargets(EXAMPLE_TARGETS, '').flatMap((g) => g.targets.map((x) => x.model))).toEqual(['inventory.items'])
    expect(groupTargets([crm, items], '').map((g) => g.addon)).toEqual(['crm', 'inventory'])
    expect(groupTargets([crm, items], 'ARTICULOS').map((g) => g.addon)).toEqual(['inventory'])
    expect(groupTargets([crm, items], 'zzz')).toEqual([])
  })

  it('explains why a target is blocked for a kind', () => {
    expect(targetBlockedReason(items, 'record.upsert')).toBeNull()
    expect(targetBlockedReason(items, 'record.delete')).toEqual({ code: 'noPermission', ops: ['delete'] })
    expect(targetBlockedReason(crm, 'record.upsert')).toEqual({ code: 'noPermission', ops: ['create', 'update'] })
    expect(targetBlockedReason({ ...items, actions: ['record.update'] }, 'record.upsert')).toEqual({ code: 'noAction', kind: 'record.upsert' })
  })

  it('suggests a source by normalized name, never by guessing unrelated fields', () => {
    const fields = [
      { path: 'customer', type: 'object' },
      { path: 'customer.Email', type: 'string' },
      { path: 'item_sku', type: 'string' },
    ]
    expect(suggestSource({ name: 'email' }, fields)).toBe('customer.Email')
    expect(suggestSource({ name: 'itemSku' }, fields)).toBe('item_sku')
    expect(suggestSource({ name: 'customer' }, fields)).toBeUndefined()
    expect(suggestSource({ name: 'phone' }, fields)).toBeUndefined()
  })

  it('validates the previewed record: required, type and options', () => {
    const mapped = ['sku', 'quantity', 'status']
    expect(validateRecord(items, { sku: 'A', quantity: 3, status: 'active' }, mapped)).toEqual([])
    const issues = validateRecord(items, { sku: '', quantity: 'abc', status: 'zzz' }, mapped)
    expect(issues.map((i) => `${i.column}:${i.code}`)).toEqual(['sku:missing', 'quantity:type', 'status:option'])
    // an unmapped column is not judged here (it is a separate blocking problem)
    expect(validateRecord(items, {}, [])).toEqual([])
  })

  it('flags save-blocking problems against the catalogue', () => {
    const base = { do: 'record.upsert', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' } }
    expect(inboundProblems([base], EXAMPLE_TARGETS)).toEqual([])
    expect(inboundProblems([{ ...base, mapping: {} }], EXAMPLE_TARGETS).map((p) => p.code)).toEqual(['requiredUnmapped', 'mappingEmpty', 'matchUnmapped'])
    expect(inboundProblems([{ ...base, match: ['name'] }], EXAMPLE_TARGETS).map((p) => p.code)).toEqual(['matchNotCandidate'])
    expect(inboundProblems([{ ...base, model: 'ghost.model' }], EXAMPLE_TARGETS).map((p) => p.code)).toEqual(['unknownTarget'])
    expect(inboundProblems([{ ...base, mapping: { ...base.mapping, secret: 'x' } }], EXAMPLE_TARGETS).map((p) => p.code)).toEqual(['columnNotAllowed'])
    expect(inboundProblems([{ ...base, model: 'crm.contacts', match: ['email'], mapping: { email: 'x' } }], [crm]).map((p) => p.code)).toEqual(['blocked'])
    expect(inboundProblems([{ do: 'notify' }], EXAMPLE_TARGETS)).toEqual([])
  })
})

describe('TargetPicker', () => {
  it('lists the declared targets by addon with useful badges', () => {
    render(<Picker />)
    const group = screen.getByRole('group', { name: 'Inventario' })
    const opt = within(group).getByRole('option', { name: /Articulos/ })
    expect(opt.getAttribute('aria-disabled')).toBeNull()
    const desc = document.getElementById(opt.getAttribute('aria-describedby')!)!.textContent!
    expect(desc).toContain('4 columns')
    expect(desc).toContain('Soft delete')
    expect(desc).toContain('By branch')
    expect(desc).not.toContain('By entity')
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('shows a target without permission disabled WITH the reason, never hidden', () => {
    const picked: string[] = []
    render(<Picker targets={[items, crm]} onPick={(m) => picked.push(m)} />)
    const blocked = screen.getByRole('option', { name: /Contactos/ })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(blocked.getAttribute('aria-describedby')!)!.textContent).toContain('You do not have permission to create, update on this model.')
    fireEvent.click(blocked)
    expect(picked).toEqual([])
    fireEvent.click(screen.getByRole('option', { name: /Articulos/ }))
    expect(picked).toEqual(['inventory.items'])
  })

  it('depends on the chosen action: delete is blocked for items, a missing capability too', () => {
    const { rerender } = render(<TargetPicker targets={[items]} value="" kind="record.delete" onChange={() => {}} t={t} />)
    const opt = screen.getByRole('option', { name: /Articulos/ })
    expect(opt.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(opt.getAttribute('aria-describedby')!)!.textContent).toContain('permission to delete')
    rerender(<TargetPicker targets={[{ ...items, actions: ['record.update'] }]} value="" kind="record.upsert" onChange={() => {}} t={t} />)
    const o2 = screen.getByRole('option', { name: /Articulos/ })
    expect(document.getElementById(o2.getAttribute('aria-describedby')!)!.textContent).toContain('does not support "record.upsert"')
  })

  it('works with the keyboard only and never submits the form', () => {
    const picked: string[] = []
    const submitted: string[] = []
    render(
      <form onSubmit={(e) => (e.preventDefault(), submitted.push('x'))}>
        <Picker targets={[crm, items]} onPick={(m) => picked.push(m)} />
      </form>,
    )
    const box = screen.getByRole('combobox')
    // order: CRM first (blocked), then Inventario
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(picked).toEqual([]) // active = blocked option
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Contactos/ }).id)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Articulos/ }).id)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(picked).toEqual(['inventory.items'])
    expect(screen.getByRole('option', { name: /Articulos/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Home' })
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Contactos/ }).id)
    fireEvent.keyDown(box, { key: 'End' })
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Articulos/ }).id)
    expect(submitted).toEqual([])
  })

  it('filters by search and clears it with Escape', () => {
    render(<Picker targets={[crm, items]} />)
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: 'inventario' } })
    expect(screen.queryByRole('group', { name: 'CRM' })).toBeNull()
    fireEvent.change(box, { target: { value: 'nope' } })
    expect(screen.getByText('No destination matches.')).toBeTruthy()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('warns when the saved model is not declared by the server', () => {
    render(<TargetPicker targets={[items]} value="ghost.model" onChange={() => {}} t={t} />)
    expect(screen.getByRole('alert').textContent).toContain('"ghost.model" is not declared by the server')
  })
})

describe('MappingEditor direction="in"', () => {
  function Harness({ initial = [] as MappingRow[], target = items }: { initial?: MappingRow[]; target?: IngestTarget }) {
    const [rows, setRows] = React.useState<MappingRow[]>(initial)
    return <MappingEditor direction="in" target={target} rows={rows} onChange={setRows} contractSchema={contractSchema} t={t} />
  }

  it('has one row per writable column and nothing else', () => {
    render(<Harness />)
    const cols = screen.getAllByRole('listitem').map((li) => li.getAttribute('data-column'))
    expect(cols).toEqual(['sku', 'warehouse', 'quantity', 'status'])
    const sku = document.querySelector('[data-column="sku"]') as HTMLElement
    expect(sku.textContent).toContain('Required')
    expect(sku.textContent).toContain('Unique')
    expect((document.querySelector('[data-column="warehouse"]') as HTMLElement).textContent).toContain('References inventory.warehouses')
  })

  it('blocks on unmapped required columns and shows the preview once mapped', () => {
    render(<Harness />)
    expect(screen.getByTestId('missing-required').textContent).toContain('Required columns without a source: sku')
    fireEvent.change(screen.getByLabelText('Source · sku'), { target: { value: 'field' } })
    fireEvent.change(screen.getByLabelText('Event field · sku'), { target: { value: 'sku' } })
    expect(screen.queryByTestId('missing-required')).toBeNull()
    fireEvent.change(screen.getByLabelText('Source · quantity'), { target: { value: 'field' } })
    fireEvent.change(screen.getByLabelText('Event field · quantity'), { target: { value: 'quantity' } })
    fireEvent.change(screen.getByLabelText('Source · status'), { target: { value: 'literal' } })
    const opts = within(screen.getByLabelText('Fixed text · status')).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(opts).toEqual(['', 'active', 'archived'])
    fireEvent.change(screen.getByLabelText('Fixed text · status'), { target: { value: 'archived' } })
    expect(JSON.parse(screen.getByTestId('record-preview').textContent!)).toEqual({ sku: 'A-1', quantity: 4, status: 'archived' })
    expect(screen.getByText('The sample record passes the local checks.')).toBeTruthy()
  })

  it('previews a pasted sample, warns on type problems and rejects invalid JSON', () => {
    render(<Harness initial={[{ target: 'quantity', kind: 'field', value: 'qty' }, { target: 'sku', kind: 'field', value: 'code' }]} />)
    fireEvent.change(screen.getByLabelText('Sample event (JSON)'), { target: { value: '{"code":"Z-9","qty":"muchos"}' } })
    expect(JSON.parse(screen.getByTestId('record-preview').textContent!)).toEqual({ sku: 'Z-9', quantity: 'muchos' })
    expect(screen.getByTestId('record-issues').textContent).toContain('quantity should be of type number.')
    fireEvent.change(screen.getByLabelText('Sample event (JSON)'), { target: { value: '{"code":' } })
    expect(screen.getAllByRole('alert').some((a) => a.textContent!.includes('not valid JSON'))).toBe(true)
    // falls back to the contract example instead of crashing
    expect(JSON.parse(screen.getByTestId('record-preview').textContent!)).toEqual({ sku: null, quantity: null })
  })

  it('only SUGGESTS a source by name and applies it on request', () => {
    render(<Harness />)
    expect(screen.getByText('Suggestion: sku')).toBeTruthy()
    // not applied on its own
    expect((screen.getByLabelText('Source · sku') as HTMLSelectElement).value).toBe('unmapped')
    expect(screen.getByTestId('missing-required')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use sku · sku' }))
    expect((screen.getByLabelText('Event field · sku') as HTMLSelectElement).value).toBe('sku')
    expect(screen.queryByTestId('missing-required')).toBeNull()
  })

  it('marks a mapped key that is not a writable column and lets you remove it', () => {
    render(<Harness initial={[{ target: 'secret_col', kind: 'literal', value: 'x' }]} />)
    expect(screen.getByText('Not an allowed column: secret_col')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove · secret_col' }))
    expect(screen.queryByText('Not an allowed column: secret_col')).toBeNull()
  })
})

describe('ActionChain with a target catalogue', () => {
  function Chain({ targets, initial = [] as ActionBlock[], onState }: { targets?: IngestTarget[]; initial?: ActionBlock[]; onState?: (a: ActionBlock[]) => void }) {
    const [a, setA] = React.useState<ActionBlock[]>(initial)
    onState?.(a)
    return <ActionChain actions={a} onChange={setA} t={t} options={{ targets, models: targets?.map((x) => x.model) }} contractSchema={contractSchema} />
  }
  const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add action' }))

  it('replaces the free-text model by the picker and writes the real templates', () => {
    let state: ActionBlock[] = []
    const parts: IngestTarget = { ...items, model: 'inventory.parts', label: 'Piezas', match_candidates: [['sku']] }
    render(<Chain targets={[items, parts]} onState={(a) => (state = a)} />)
    add()
    expect(screen.queryByLabelText('Model')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: /Articulos/ }))
    expect((screen.getByLabelText('Identify the record by') as HTMLSelectElement).value).toBe('')
    const matchOpts = within(screen.getByLabelText('Identify the record by')).getAllByRole('option').map((o) => o.textContent)
    expect(matchOpts).toEqual(['Choose how to find the record…', 'sku', 'warehouse, external_id'])
    fireEvent.change(screen.getByLabelText('Identify the record by'), { target: { value: 'sku' } })
    fireEvent.change(screen.getByLabelText('Source · sku'), { target: { value: 'field' } })
    fireEvent.change(screen.getByLabelText('Event field · sku'), { target: { value: 'sku' } })
    expect(state[0]).toMatchObject({ do: 'record.upsert', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' } })
    // switching model resets the columns that no longer apply
    fireEvent.click(screen.getByRole('option', { name: /Piezas/ }))
    expect(state[0]).toMatchObject({ model: 'inventory.parts', match: ['sku'], mapping: {} })
  })

  it('keeps the legacy free-text model when the host has no listTargets', () => {
    let state: ActionBlock[] = []
    render(<Chain onState={(a) => (state = a)} />)
    add()
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'customers' } })
    expect(state[0]).toMatchObject({ model: 'customers' })
    expect(screen.getByLabelText('Match by (comma separated)')).toBeTruthy()
  })
})

describe('InboundTab', () => {
  const contracts = [{ key: 'stock', name: 'Stock', schema: contractSchema }]

  async function openForm(api: ReturnType<typeof createMemoryIntegrationsApi>) {
    render(<InboundTab api={api} t={t} />)
    await screen.findByText('Nothing here yet.')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    await screen.findByRole('option', { name: 'Stock' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Stock' } })
    fireEvent.change(screen.getByLabelText('Contract'), { target: { value: 'stock' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }))
  }

  it('blocks saving while a required column is unmapped, then saves', async () => {
    const api = createMemoryIntegrationsApi({ contracts })
    await openForm(api)
    fireEvent.click(await screen.findByRole('option', { name: /Articulos/ }))
    fireEvent.change(screen.getByLabelText('Identify the record by'), { target: { value: 'sku' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(alerts.join(' ')).toContain('Required columns without a source: sku.')
    expect(api.calls).not.toContain('saveInbound')
    fireEvent.change(screen.getByLabelText('Source · sku'), { target: { value: 'field' } })
    fireEvent.change(screen.getByLabelText('Event field · sku'), { target: { value: 'sku' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.calls).toContain('saveInbound'))
  })

  it('is backward compatible: a host without listTargets keeps the model text box', async () => {
    const api = createMemoryIntegrationsApi({ contracts })
    delete (api as { listTargets?: unknown }).listTargets
    api.listModels = async () => ['inventory.items']
    await openForm(api)
    fireEvent.change(await screen.findByLabelText('Model'), { target: { value: 'whatever' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(screen.getByLabelText('Match by (comma separated)'), { target: { value: 'id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.calls).toContain('saveInbound'))
  })

  it('does not list anything the server does not declare', async () => {
    const api = createMemoryIntegrationsApi({ contracts, targets: [crm] })
    await openForm(api)
    const opts = await screen.findAllByRole('option', { name: /Contactos/ })
    expect(opts).toHaveLength(1)
    expect(screen.queryByRole('option', { name: /Articulos/ })).toBeNull()
    expect(opts[0]!.getAttribute('aria-disabled')).toBe('true')
  })
})
