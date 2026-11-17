// @vitest-environment happy-dom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ActionChain,
  CredentialOnce,
  EventPicker,
  IntegrationsPanel,
  MappingEditor,
  buildSamplePayload,
  createMemoryIntegrationsApi,
  createT,
  EXAMPLE_EVENTS,
  flattenSchemaFields,
  groupEvents,
  mappingToTemplates,
  parseActions,
  previewBody,
  renderTemplate,
  templatesToMapping,
  type ActionBlock,
  type MappingRow,
} from './index'

afterEach(cleanup)
const tEs = createT('es')
const tEn = createT('en')
const orderSchema = EXAMPLE_EVENTS[0]!.payload_schema

describe('schema helpers', () => {
  it('flattens nested objects into dotted source fields', () => {
    const paths = flattenSchemaFields(orderSchema).map((f) => f.path)
    expect(paths).toEqual(['customer', 'customer.email', 'customer.name', 'id', 'total'])
    expect(flattenSchemaFields(orderSchema).find((f) => f.path === 'id')?.required).toBe(true)
    expect(flattenSchemaFields(undefined)).toEqual([])
  })

  it('builds a sample honouring example/format', () => {
    const s = buildSamplePayload(orderSchema)
    expect(s.total).toBe(1250.5)
    expect((s.customer as { name: string }).name).toBe('Ana Pérez')
    expect(s.id).toMatch(/^0{8}-/)
  })

  it('renders templates keeping the type of a lone placeholder', () => {
    const scope = { payload: { total: 10, name: 'Ana' } }
    expect(renderTemplate('{{payload.total}}', scope)).toBe(10)
    expect(renderTemplate('Hola {{payload.name}}!', scope)).toBe('Hola Ana!')
    expect(renderTemplate('{{payload.missing}}', scope)).toBeNull()
  })

  it('round-trips mapping rows <-> templates and previews nested targets', () => {
    const rows: MappingRow[] = [
      { target: 'cliente.nombre', kind: 'field', value: 'customer.name' },
      { target: 'origen', kind: 'literal', value: 'ops' },
    ]
    const map = mappingToTemplates(rows)
    expect(map).toEqual({ 'cliente.nombre': '{{payload.customer.name}}', origen: 'ops' })
    expect(templatesToMapping(map)).toEqual(rows)
    expect(previewBody(rows, buildSamplePayload(orderSchema), 'sales.order.created')).toEqual({
      cliente: { nombre: 'Ana Pérez' },
      origen: 'ops',
    })
    // empty mapping sends the payload as is
    expect(previewBody([], { a: 1 }, 'x.y.z')).toEqual({ a: 1 })
  })

  it('groups by addon and searches without accents/case', () => {
    expect(groupEvents(EXAMPLE_EVENTS, '').map((g) => g.addon)).toEqual(['crm', 'sales'])
    expect(groupEvents(EXAMPLE_EVENTS, 'VENTAS').map((g) => g.addon)).toEqual(['sales'])
    expect(groupEvents(EXAMPLE_EVENTS, 'contact')[0]!.events[0]!.name).toBe('crm.contact.created')
    expect(groupEvents(EXAMPLE_EVENTS, 'zzz')).toEqual([])
  })
})

describe('parseActions (closed set)', () => {
  it('accepts the four blocks and rejects unknown / malformed ones', () => {
    const ok = parseActions([
      { do: 'record.upsert', model: 'customers', match: ['external_ref'], mapping: { name: '{{payload.nombre}}' } },
      { do: 'event.emit', name: 'customers.customer.imported', payload: { id: '{{result.id}}' } },
      { do: 'notify', template: 'cliente_importado', when: { path: 'result.created', eq: true } },
      { do: 'command.run', command: 'inventory.recount' },
    ])
    expect(ok.ok && ok.actions).toHaveLength(4)
    expect(parseActions([{ do: 'shell.exec' }]).ok).toBe(false)
    expect(parseActions([{ do: 'record.upsert', model: 'x', match: 'id', mapping: {} }]).ok).toBe(false)
    expect(parseActions({}).ok).toBe(false)
  })
})

describe('EventPicker', () => {
  function Harness({ initial = [] as string[] }) {
    const [sel, setSel] = React.useState(initial)
    return (
      <>
        <EventPicker events={EXAMPLE_EVENTS} selected={sel} onChange={setSel} t={tEn} />
        <output data-testid="sel">{[...sel].sort().join(',')}</output>
      </>
    )
  }

  it('groups by addon, toggles one and a whole group', () => {
    render(<Harness />)
    const sales = screen.getByRole('group', { name: 'Ventas' })
    fireEvent.click(within(sales).getByRole('checkbox', { name: /sales.order.created/ }))
    expect(screen.getByTestId('sel').textContent).toBe('sales.order.created')
    fireEvent.click(within(sales).getByRole('checkbox', { name: 'Select all events of Ventas' }))
    expect(screen.getByTestId('sel').textContent).toBe('sales.order.cancelled,sales.order.created')
    fireEvent.click(within(sales).getByRole('checkbox', { name: 'Select all events of Ventas' }))
    expect(screen.getByTestId('sel').textContent).toBe('')
  })

  it('filters by search, keeps hidden selections, and flags personal data', () => {
    render(<Harness initial={['sales.order.created']} />)
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'crm' } })
    expect(screen.queryByRole('group', { name: 'Ventas' })).toBeNull()
    expect(screen.getByRole('group', { name: 'CRM' })).toBeTruthy()
    expect(screen.getByTestId('sel').textContent).toBe('sales.order.created')
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'nope' } })
    expect(screen.getByText('No events match.')).toBeTruthy()
  })
})

describe('MappingEditor', () => {
  it('picks source fields from the schema and shows the live preview', () => {
    function H() {
      const [rows, setRows] = React.useState<MappingRow[]>([])
      return <MappingEditor events={[EXAMPLE_EVENTS[0]!]} rows={rows} onChange={setRows} t={tEn} />
    }
    render(<H />)
    expect(screen.getByText('No mapping: the whole event is sent as is.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
    fireEvent.change(screen.getByLabelText('Destination field'), { target: { value: 'email' } })
    const select = screen.getAllByLabelText('Event field').find((el) => el.tagName === 'SELECT')!
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toContain('customer.email (string)')
    fireEvent.change(select, { target: { value: 'customer.name' } })
    const body = JSON.parse(screen.getByTestId('mapping-preview').textContent!)
    expect(body).toEqual({ email: 'Ana Pérez' })
  })
})

describe('CredentialOnce', () => {
  it('shows the value once and drops it after confirmation', () => {
    function H() {
      const [c, setC] = React.useState<{ value: string } | null>({ value: 'mcs_secret_123' })
      return c ? <CredentialOnce credential={c} onDone={() => setC(null)} t={tEs} /> : <p>listo</p>
    }
    render(<H />)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByTestId('credential-value').textContent).toBe('mcs_secret_123')
    expect(screen.getByText('Se muestra una sola vez. No podrás volver a verla.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ya la guardé' }))
    expect(screen.queryByText('mcs_secret_123')).toBeNull()
    expect(document.body.textContent).not.toContain('mcs_secret_123')
  })
})

describe('ActionChain', () => {
  function H({ initial = [] as ActionBlock[] }) {
    const [a, setA] = React.useState(initial)
    return (
      <>
        <ActionChain actions={a} onChange={setA} t={tEn} options={{ models: ['customers'] }} />
        <output data-testid="actions">{JSON.stringify(a)}</output>
      </>
    )
  }
  const read = () => JSON.parse(screen.getByTestId('actions').textContent!) as ActionBlock[]

  it('adds, edits, reorders and removes blocks without writing JSON', () => {
    render(<H />)
    fireEvent.change(screen.getByLabelText('Add action', { selector: 'select' }), { target: { value: 'notify' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }))
    fireEvent.change(screen.getByLabelText('Add action', { selector: 'select' }), { target: { value: 'record.upsert' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }))
    expect(read().map((a) => a.do)).toEqual(['notify', 'record.upsert'])

    const upsert = document.querySelector('[data-action="record.upsert"]') as HTMLElement
    fireEvent.change(within(upsert).getByLabelText('Model'), { target: { value: 'customers' } })
    fireEvent.change(within(upsert).getByLabelText('Match by (comma separated)'), { target: { value: 'external_ref, email' } })
    fireEvent.click(within(upsert).getByRole('button', { name: 'Add field' }))
    fireEvent.change(within(upsert).getByLabelText('Field'), { target: { value: 'name' } })
    fireEvent.change(within(upsert).getByLabelText(/^Value/), { target: { value: '{{payload.nombre}}' } })
    expect(read()[1]).toEqual({ do: 'record.upsert', model: 'customers', match: ['external_ref', 'email'], mapping: { name: '{{payload.nombre}}' } })

    fireEvent.click(within(upsert).getByRole('button', { name: 'Move up' }))
    expect(read().map((a) => a.do)).toEqual(['record.upsert', 'notify'])
    fireEvent.click(within(document.querySelector('[data-action="notify"]') as HTMLElement).getByRole('button', { name: 'Remove' }))
    expect(read().map((a) => a.do)).toEqual(['record.upsert'])
  })

  it('advanced JSON view validates against the closed set', () => {
    render(<H initial={[{ do: 'command.run', command: 'a.b' }]} />)
    fireEvent.click(screen.getByLabelText('Advanced view (JSON)'))
    const area = screen.getByRole('textbox')
    fireEvent.change(area, { target: { value: '[{"do":"shell.exec"}]' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert').textContent).toContain('actions[0].do must be one of')
    fireEvent.change(area, { target: { value: '[{"do":"event.emit","name":"a.b.c","payload":{}}]' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(read()).toEqual([{ do: 'event.emit', name: 'a.b.c', payload: {} }])
  })
})

describe('IntegrationsPanel', () => {
  it('has accessible tabs with arrow-key navigation and es/en labels', () => {
    const api = createMemoryIntegrationsApi()
    const { unmount } = render(<IntegrationsPanel api={api} locale="es" />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual(['Salidas', 'Entradas', 'Registro'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' })
    expect(screen.getAllByRole('tab')[1]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs[1]!.id)
    fireEvent.keyDown(screen.getAllByRole('tab')[1]!, { key: 'End' })
    expect(screen.getAllByRole('tab')[2]!.getAttribute('aria-selected')).toBe('true')
    unmount()
    render(<IntegrationsPanel api={api} locale="en" />)
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Outbound', 'Inbound', 'Log'])
  })

  it('creates an outbound subscription end to end through the API', async () => {
    const api = createMemoryIntegrationsApi()
    render(<IntegrationsPanel api={api} locale="en" />)
    await screen.findByText('Nothing here yet.')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toContain('Enter a name.')
    expect(api.calls).not.toContain('saveSubscription')

    await screen.findByRole('group', { name: 'Ventas' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ERP' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /sales.order.created/ }))
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://erp.example/hook' } })
    fireEvent.change(screen.getByLabelText('Destination credential'), { target: { value: 'tok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }))
    await screen.findByText('Test delivered (200, 42 ms).')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('ERP')
    expect(api.calls).toContain('saveSubscription')
    // the destination credential is write-only: not echoed in the list
    expect(document.body.textContent).not.toContain('tok')
  })

  it('creates an inbound endpoint and shows the generated credential exactly once', async () => {
    const api = createMemoryIntegrationsApi()
    render(<IntegrationsPanel api={api} locale="en" tab="in" />)
    await screen.findByText('Nothing here yet.')
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    await screen.findByRole('option', { name: /CRM: cliente nuevo/ })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CRM' } })
    fireEvent.change(screen.getByLabelText('Contract'), { target: { value: 'crm-cliente-nuevo' } })
    fireEvent.change(screen.getByLabelText('Add action', { selector: 'select' }), { target: { value: 'event.emit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add action' }))
    // incomplete block blocks saving
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toContain('Emit an event')
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'customers.customer.imported' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const cred = await screen.findByTestId('credential-value')
    const value = cred.textContent!
    expect(value).toMatch(/^mcs_/)
    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))
    await screen.findByText('CRM')
    expect(document.body.textContent).not.toContain(value)
  })

  it('lists the log, filters, and replays a failed delivery', async () => {
    const api = createMemoryIntegrationsApi({
      log: [
        { id: 'a', direction: 'out', event: 'sales.order.created', endpoint: 'ERP', status: 'failed', at: '2026-01-15T10:00:00Z', http_status: 500, error: 'boom' },
        { id: 'b', direction: 'in', event: 'crm.contact.created', endpoint: 'CRM', status: 'delivered', at: '2026-01-15T11:00:00Z' },
      ],
    })
    render(<IntegrationsPanel api={api} locale="en" tab="log" />)
    await screen.findByText('boom')
    expect(screen.getAllByRole('row')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'in' } })
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: '' } })
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: 'Replay sales.order.created' }))
    await screen.findByText('Replay queued.')
    expect(api.calls).toContain('replay:a')
  })

  it('surfaces API errors without crashing', async () => {
    const api = createMemoryIntegrationsApi()
    api.listSubscriptions = async () => {
      throw new Error('503 down')
    }
    render(<IntegrationsPanel api={api} locale="en" />)
    expect((await screen.findByRole('alert')).textContent).toContain('503 down')
  })
})
