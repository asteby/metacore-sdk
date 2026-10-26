// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import { createStorefrontClient, type Subject } from '@asteby/storefront'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL, MOCK_SUBJECT_KINDS } from '@asteby/storefront/mock'
import { SubjectFilter, SubjectFitBadge, SubjectGarage, SubjectPicker, useSubjects } from './index.js'

const garage = MOCK_SUBJECT_KINDS[0]!
const size = MOCK_SUBJECT_KINDS[1]!
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const PLATE = 'ZXQ-9917'

afterEach(cleanup)

const saved = (over: Partial<Subject> = {}): Subject => ({
  id: 's1', kind: 'vehicle', label: 'Nissan NP300 Frontier 2012 2.5 L', nickname: 'El de diario', fit_key: 'nissan/np300/2012/2.5',
  attributes: { make: 'nissan', model: 'np300', year: 2012, engine: '2.5', plate: '••17' }, is_default: true, created_at: '2026-10-01T00:00:00Z', ...over,
})
const select = (c: HTMLElement, key: string) => c.querySelector<HTMLSelectElement>(`select[name="subject.${key}"]`)!
const optionValues = (el: HTMLSelectElement) => [...el.options].map((o) => o.value).filter(Boolean)

describe('<SubjectPicker />', () => {
  it('draws one control per field of the DATA, a cascade that narrows, and nothing named after a kind', () => {
    const { container } = render(<SubjectPicker kind={garage} />)
    expect([...container.querySelectorAll('[data-sf-subject-field]')].map((e) => e.getAttribute('data-sf-subject-field'))).toEqual(['make', 'model', 'year', 'engine', 'plate', 'nickname'])
    expect(optionValues(select(container, 'make'))).toEqual(['ford', 'nissan'])
    expect(select(container, 'model').disabled).toBe(true) // waits for the make
    fireEvent.change(select(container, 'make'), { target: { value: 'nissan' } })
    expect(optionValues(select(container, 'model'))).toEqual(['np300', 'versa'])
    fireEvent.change(select(container, 'model'), { target: { value: 'np300' } })
    expect(optionValues(select(container, 'year'))[0]).toBe('2022') // years of the model, newest first
    fireEvent.change(select(container, 'year'), { target: { value: '2018' } })
    expect(optionValues(select(container, 'engine'))).toEqual(['2.4']) // 2.5 L is 2010-2015
    // A change upstream clears what no longer applies.
    fireEvent.change(select(container, 'make'), { target: { value: 'ford' } })
    expect(select(container, 'model').value).toBe('')
  })

  it('the private field is never prefilled, says so, and an edit offers to keep or remove the stored one', async () => {
    const { container } = render(<SubjectPicker kind={garage} subject={saved()} />)
    const plate = container.querySelector<HTMLInputElement>('input[name="subject.plate"]')!
    expect(plate.value).toBe('')
    expect(plate.autocomplete).toBe('off')
    expect(container.querySelector('[data-sf-subject-private-note]')!.textContent).toContain('Solo tú lo ves')
    expect(container.querySelector('[data-sf-subject-private-note]')!.textContent).toContain('conservar')
    expect(container.querySelector('input[name="subject.plate.clear"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain(PLATE)
    expect(select(container, 'make').value).toBe('nissan') // public values do start the form
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('with JavaScript it validates like the server and hands over the input; an edit does not need the stored private value', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<SubjectPicker kind={garage} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[data-sf-subject-error]').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-sf-subject-field="make"] [data-sf-subject-error]')!.textContent).toBe('Completa este campo.')
    fireEvent.change(select(container, 'make'), { target: { value: 'nissan' } })
    fireEvent.change(select(container, 'model'), { target: { value: 'versa' } })
    fireEvent.change(select(container, 'year'), { target: { value: '2018' } })
    fireEvent.change(select(container, 'engine'), { target: { value: '1.6' } })
    fireEvent.change(container.querySelector('input[name="subject.plate"]')!, { target: { value: PLATE } })
    fireEvent.change(container.querySelector('input[name="nickname"]')!, { target: { value: '  Mío ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toEqual({ kind: 'vehicle', attributes: { make: 'nissan', model: 'versa', year: '2018', engine: '1.6', plate: PLATE }, nickname: 'Mío' })
  })

  it('an edit sends only what changed shape: the stored private value stays unless cleared', () => {
    const onSubmit = vi.fn()
    const { container } = render(<SubjectPicker kind={garage} subject={saved()} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit.mock.calls[0]![0].attributes).not.toHaveProperty('plate')
    fireEvent.click(container.querySelector('input[name="subject.plate.clear"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit.mock.calls[1]![0].attributes.plate).toBeNull()
  })

  it('shows the errors the action returned, by field, without the value', () => {
    const { container } = render(<SubjectPicker kind={garage} data={{ ok: false, intent: 'subject-save', values: { make: 'nissan', model: 'np300', year: '2007' }, fieldErrors: { year: 'year_range' }, error: { code: 'validation', field: 'year' } }} />)
    expect(container.querySelector('[data-sf-subject-field="year"] [data-sf-subject-error]')!.textContent).toBe('Ese año no corresponde a lo que elegiste.')
    expect(select(container, 'make').value).toBe('nissan')
    expect(container.querySelector('input[name="subject.year"]') ?? select(container, 'year')).toBeTruthy()
  })

  it('works for a kind that is nothing like a vehicle, in English', () => {
    const { container } = render(<SubjectPicker kind={size} locale="en-US" />)
    expect(container.querySelectorAll('input[type="text"][name^="subject."]')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('renders as a plain form that posts (no JavaScript): intent, kind, field names and a noscript «Continue»', () => {
    const html = renderToString(<SubjectPicker kind={garage} action="/garage" values={{ make: 'nissan' }} />)
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/garage"')
    expect(html).toContain('name="intent" value="subject-save"')
    expect(html).toContain('name="kind" value="vehicle"')
    expect(html).toContain('name="subject.make"')
    expect(html).toMatch(/<noscript>.*subject-refine.*<\/noscript>/s)
    // the make was refilled, so the model level is already open
    expect(html).toContain('value="np300"')
  })
})

describe('<SubjectGarage />', () => {
  const second = saved({ id: 's2', label: 'Nissan Versa 2018 1.6 L', nickname: null, fit_key: 'nissan/versa/2018/1.6', attributes: { make: 'nissan', model: 'versa', year: 2018, engine: '1.6' }, is_default: false })

  it('lists the items with the active one marked, the private value masked and the parts link', async () => {
    const { container } = render(<SubjectGarage kind={garage} subjects={[saved(), second]} partsHref={(s) => `/piezas?para=${encodeURIComponent(s.fit_key)}`} />)
    expect(screen.getByRole('heading', { name: 'Mi garage' })).toBeTruthy() // the name comes from the data
    const cards = container.querySelectorAll('[data-sf-subject]')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.getAttribute('data-sf-subject-active')).toBe('')
    expect(within(cards[0] as HTMLElement).getByText('Activo')).toBeTruthy()
    expect(cards[0]!.textContent).toContain('Placas (opcional): ••17')
    expect(container.textContent).not.toContain(PLATE)
    expect((cards[0]!.querySelector('[data-sf-subject-parts]') as HTMLAnchorElement).getAttribute('href')).toBe('/piezas?para=nissan%2Fnp300%2F2012%2F2.5')
    expect(cards[0]!.querySelector('[data-sf-subject-default-form]')).toBeNull() // already active
    expect(cards[1]!.querySelector('[data-sf-subject-default-form]')).toBeTruthy()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('delete is a form behind an inline confirmation; making active posts the intent', () => {
    const onDelete = vi.fn()
    const onMakeDefault = vi.fn()
    const { container } = render(<SubjectGarage kind={garage} subjects={[saved(), second]} onDelete={onDelete} onMakeDefault={onMakeDefault} />)
    const remove = container.querySelectorAll('[data-sf-subject-remove]')[1]!
    expect(remove.querySelector('input[name="intent"]')!.getAttribute('value')).toBe('subject-delete')
    expect(remove.textContent).toContain('Se borra de verdad')
    fireEvent.click(within(remove as HTMLElement).getByRole('button', { name: 'Sí, eliminar Nissan Versa 2018 1.6 L' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }))
    fireEvent.click(container.querySelector('[data-sf-subject-default-form] button')!)
    expect(onMakeDefault).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }))
  })

  it('empty, at the limit and degraded states', () => {
    const empty = render(<SubjectGarage kind={garage} subjects={[]} />)
    expect(empty.container.querySelector('[data-sf-subject-empty]')!.textContent).toBe('Aún no guardas ningún vehículo.')
    expect(empty.container.querySelector('[data-sf-subject-add]')).toBeTruthy()
    empty.unmount()
    const three = [saved(), second, saved({ id: 's3', is_default: false, fit_key: 'x' })]
    const full = render(<SubjectGarage kind={garage} subjects={three} />)
    expect(full.container.querySelector('[data-sf-subject-add]')).toBeNull()
    expect(full.container.querySelector('[data-sf-subject-limit]')!.textContent).toContain('(3)')
    full.unmount()
    const retry = vi.fn()
    const bad = render(<SubjectGarage kind={garage} subjects={[]} status="error" onRetry={retry} />)
    expect(bad.container.querySelector('[data-sf-subject-degraded]')!.textContent).toContain('No pudimos cargar esto.')
    expect(bad.container.querySelector('[data-sf-subject-list]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalled()
  })

  it('only shows the items of its kind', () => {
    const { container } = render(<SubjectGarage kind={garage} subjects={[saved(), saved({ id: 'z', kind: 'size', label: 'Camisa M' })]} />)
    expect(container.textContent).not.toContain('Camisa M')
  })

  it('reopens the form that failed (without JavaScript) with its errors', () => {
    const data = { ok: false, intent: 'subject-save' as const, id: 's2', values: { make: 'nissan', model: 'versa', year: '2001' }, fieldErrors: { year: 'year_range' as const }, error: { code: 'validation' as const, field: 'year' } }
    const { container } = render(<SubjectGarage kind={garage} subjects={[saved(), second]} data={data} />)
    const open = container.querySelectorAll('details[open]')
    expect(open).toHaveLength(1)
    expect(open[0]!.querySelector('input[name="id"]')!.getAttribute('value')).toBe('s2')
    expect(open[0]!.querySelector('[data-sf-subject-error]')!.textContent).toContain('año')
  })
})

describe('<SubjectFilter /> and <SubjectFitBadge />', () => {
  it('says what applies, and links to change it or to see everything (URL-shareable, no JS needed)', () => {
    const { container } = render(<SubjectFilter kind={garage} active={{ label: 'Nissan NP300 2012', fit_key: 'k' }} changeHref="/garage" showAllHref="?todo=1" />)
    expect(container.textContent).toContain('Para: Nissan NP300 2012')
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/garage', '?todo=1'])
    cleanup()
    const all = render(<SubjectFilter kind={garage} active={{ label: 'x', fit_key: 'k' }} showingAll onlyFitsHref="?" />)
    expect(all.container.querySelector('[data-sf-subject-showing]')!.getAttribute('data-sf-subject-showing')).toBe('all')
    expect(all.container.textContent).toContain('Solo lo compatible')
  })

  it('without an active item it invites to choose, and without a place to choose it renders nothing', () => {
    const { container } = render(<SubjectFilter kind={garage} active={null} chooseHref="/garage" />)
    expect(container.textContent).toBe('Elige tu vehículo para ver solo lo que le queda')
    cleanup()
    expect(render(<SubjectFilter kind={garage} active={null} />).container.innerHTML).toBe('')
  })

  it('the badge claims only what the data says', () => {
    expect(render(<SubjectFitBadge kind={garage} state="fits" />).container.textContent).toBe('Compatible con tu vehículo')
    cleanup()
    expect(render(<SubjectFitBadge kind={{ ...garage, label: 'Vehicle' }} state="no" locale="en" />).container.textContent).toBe('Not for your vehicle')
    cleanup()
    expect(render(<SubjectFitBadge kind={garage} state="unknown" />).container.innerHTML).toBe('') // no data, no claim
    cleanup()
    expect(render(<SubjectFitBadge kind={garage} state="unknown" showUnknown />).container.textContent).toBe('Sin datos de compatibilidad')
  })
})

describe('useSubjects', () => {
  const clientOf = (opts: Parameters<typeof createMockStorefront>[0]) => {
    const mock = createMockStorefront(opts)
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    return sf
  }
  const signedIn = async (sf: ReturnType<typeof clientOf>) => {
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    return sf.withCustomerToken((await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })).token)
  }

  it('a store that declares no kind is «unavailable»: the section does not exist', async () => {
    const sf = await signedIn(clientOf({}))
    const { result } = renderHook(() => useSubjects(sf))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.kinds).toEqual([])
  })

  it('loads the kinds and the items, and reloads after a write', async () => {
    const sf = await signedIn(clientOf({ subjectKinds: MOCK_SUBJECT_KINDS }))
    const { result } = renderHook(() => useSubjects(sf))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.subjects).toEqual([])
    await act(async () => {
      await result.current.create({ kind: 'size', attributes: { garment: 'Camisa', value: 'M' } })
    })
    await waitFor(() => expect(result.current.subjects).toHaveLength(1))
    const id = result.current.subjects[0]!.id
    await act(async () => {
      await result.current.remove(id)
    })
    await waitFor(() => expect(result.current.subjects).toEqual([]))
  })

  it('a failed read is «error» with a retry that works', async () => {
    const mock = createMockStorefront({ subjectKinds: MOCK_SUBJECT_KINDS })
    let down = true
    const sf = createStorefrontClient({
      baseUrl: 'https://mock.local/api/gw',
      token: 'sk_mock',
      fetch: (i, init) => (down && String(i).includes('/customer/subjects') ? Promise.resolve(Response.json({ error: { code: 'internal', message: 'x' } }, { status: 500 })) : mock.fetch(i, init)),
      retries: 0,
    } as never)
    const me = await signedIn(sf)
    const { result } = renderHook(() => useSubjects(me))
    await waitFor(() => expect(result.current.status).toBe('error'))
    down = false
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})
