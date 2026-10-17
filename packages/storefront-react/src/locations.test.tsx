// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createStorefrontClient, type Location, type ShopBranch } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import {
  DirectionsLink,
  LocationList,
  LocationPicker,
  NearestLocationForm,
  OpenStatus,
  PickupOption,
  StorefrontProvider,
  readSelectedLocationId,
  useGeolocation,
  useNearestLocations,
  useSelectedLocation,
} from './index.js'

const branches: Location[] = [
  {
    id: 'b1', name: 'Centro', kind: 'store', address: 'Calle 1', city: 'CDMX', postal_code: '06000', phone: null, lat: 19.4326, lng: -99.1332, hours: null,
    timezone: 'America/Mexico_City', opening_hours: { weekly: [1, 2, 3, 4, 5].map((day) => ({ day, open: '09:00', close: '19:00' })) },
    services: [], contacts: { phone: null, email: null, whatsapp: null }, pickup: { enabled: true, fee: null, prep_days: 0 },
  },
  {
    id: 'b2', name: 'Norte', kind: 'store', address: 'Calle 2', city: 'Monterrey', postal_code: '64000', phone: null, lat: 25.6866, lng: -100.3161, hours: null,
    services: [], contacts: { phone: null, email: null, whatsapp: null }, pickup: { enabled: true, fee: { amount: '30.00', currency_code: 'MXN' }, prep_days: 1 },
  },
  {
    id: 'b3', name: 'Sin recolección', kind: 'pickup_point', address: 'Calle 3', city: 'Guadalajara', postal_code: '44100', phone: null, lat: null, lng: null, hours: null,
    services: [], contacts: { phone: null, email: null, whatsapp: null }, pickup: { enabled: false, fee: null, prep_days: 2 },
  },
]

const geoStub = (impl?: (ok: PositionCallback, ko: PositionErrorCallback) => void) => {
  const getCurrentPosition = vi.fn(impl ?? ((ok: PositionCallback) => ok({ coords: { latitude: 25.67, longitude: -100.31 } } as GeolocationPosition)))
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  // @ts-expect-error test cleanup of the stub
  delete navigator.geolocation
  vi.useRealTimers()
})

describe('useGeolocation', () => {
  it('never asks on mount; request() resolves the point under a user action', async () => {
    const stub = geoStub()
    const { result } = renderHook(() => useGeolocation())
    await waitFor(() => expect(result.current.supported).toBe(true))
    expect(stub).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    let point: unknown
    await act(async () => { point = await result.current.request() })
    expect(point).toEqual({ lat: 25.67, lng: -100.31 })
    expect(result.current).toMatchObject({ status: 'success', position: { lat: 25.67, lng: -100.31 }, error: null })
    expect(stub.mock.calls[0]![2]).toMatchObject({ timeout: 10_000, enableHighAccuracy: false })
  })

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('maps browser error %i to a typed %s failure', async (code, expected) => {
    geoStub((_ok, ko) => ko({ code } as GeolocationPositionError))
    const { result } = renderHook(() => useGeolocation())
    let point: unknown = 'x'
    await act(async () => { point = await result.current.request() })
    expect(point).toBeNull()
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe(expected)
    expect(result.current.error?.message).toMatch(/\S/)
  })

  it('reports unsupported browsers and insecure contexts without calling the browser', async () => {
    const a = renderHook(() => useGeolocation())
    await act(async () => { await a.result.current.request() })
    expect(a.result.current).toMatchObject({ supported: false, error: { code: 'unsupported' } })

    const stub = geoStub()
    const secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const b = renderHook(() => useGeolocation())
    await act(async () => { await b.result.current.request() })
    expect(b.result.current.error?.code).toBe('insecure')
    expect(stub).not.toHaveBeenCalled()
    if (secure) Object.defineProperty(window, 'isSecureContext', secure)
    else delete (window as { isSecureContext?: boolean }).isSecureContext
  })

  it('reads the permission state without prompting and follows changes', async () => {
    const stub = geoStub()
    const status = Object.assign(new EventTarget(), { state: 'prompt' })
    Object.defineProperty(navigator, 'permissions', { value: { query: vi.fn(async () => status) }, configurable: true })
    const { result } = renderHook(() => useGeolocation())
    await waitFor(() => expect(result.current.permission).toBe('prompt'))
    status.state = 'denied'
    act(() => { status.dispatchEvent(new Event('change')) })
    expect(result.current.permission).toBe('denied')
    expect(stub).not.toHaveBeenCalled()
    delete (navigator as { permissions?: unknown }).permissions
  })
})

describe('useNearestLocations', () => {
  it('ranks in the browser (no request) when it has an origin and branches', () => {
    const fetch = vi.fn()
    const client = createStorefrontClient({ baseUrl: 'https://x.test', token: 'pk_x', fetch })
    const { result } = renderHook(() => useNearestLocations({ origin: { lat: 25.67, lng: -100.31 }, locations: branches, client }))
    expect(result.current.source).toBe('local')
    expect(result.current.locations.map((l) => l.id)).toEqual(['b2', 'b1']) // b3 has no coordinates
    expect(result.current.locations[0]!.distance_km).toBeLessThan(5)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('applies limit and radiusKm', () => {
    const o = { origin: { lat: 25.67, lng: -100.31 }, locations: branches }
    expect(renderHook(() => useNearestLocations({ ...o, limit: 1 })).result.current.locations.map((l) => l.id)).toEqual(['b2'])
    expect(renderHook(() => useNearestLocations({ ...o, radiusKm: 50 })).result.current.locations.map((l) => l.id)).toEqual(['b2'])
  })

  it('asks the server for a postal code and for a forced remote origin', async () => {
    const mock = createMockStorefront()
    const client = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: mock.fetch })
    const a = renderHook(() => useNearestLocations({ postalCode: '64000', client }))
    expect(a.result.current.status).toBe('loading')
    await waitFor(() => expect(a.result.current.status).toBe('success'))
    expect(a.result.current).toMatchObject({ source: 'remote' })
    expect(a.result.current.locations[0]!.id).toBe('br_norte')

    const origin = { lat: 20.67, lng: -103.35 }
    const b = renderHook(() => useNearestLocations({ origin, remote: true, client, limit: 1 }))
    await waitFor(() => expect(b.result.current.status).toBe('success'))
    expect(b.result.current.locations.map((l) => l.id)).toEqual(['br_occidente'])
  })

  it('surfaces server errors', async () => {
    const client = createStorefrontClient({ baseUrl: 'https://x.test', token: 'pk_x', fetch: async () => new Response('{}', { status: 500 }) })
    const { result } = renderHook(() => useNearestLocations({ postalCode: '06000', client }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('is idle and empty with zero branches or no input', () => {
    expect(renderHook(() => useNearestLocations({ origin: { lat: 1, lng: 1 }, locations: [] })).result.current).toMatchObject({ status: 'idle', locations: [], source: null })
    expect(renderHook(() => useNearestLocations({ locations: branches })).result.current.status).toBe('idle')
  })

  it('uses shop.branches from the provider', () => {
    const shop = { branches } as never
    const { result } = renderHook(() => useNearestLocations({ origin: { lat: 19.4, lng: -99.1 } }), {
      wrapper: ({ children }) => <StorefrontProvider shop={shop}>{children}</StorefrontProvider>,
    })
    expect(result.current.locations[0]!.id).toBe('b1')
  })
})

describe('useSelectedLocation', () => {
  it('reads ?sucursal= first, persists it to localStorage and never writes a cookie', async () => {
    history.replaceState(null, '', '/?sucursal=b2')
    localStorage.setItem('sf_sucursal', 'b1')
    const { result } = renderHook(() => useSelectedLocation({ locations: branches }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.id).toBe('b2')
    expect(result.current.location?.name).toBe('Norte')
    await waitFor(() => expect(localStorage.getItem('sf_sucursal')).toBe('b2'))
    expect(document.cookie).toBe('')
  })

  it('falls back to localStorage, select() updates storage, URL and every instance; clear() forgets', async () => {
    localStorage.setItem('sf_sucursal', 'b1')
    const a = renderHook(() => useSelectedLocation({ locations: branches }))
    const b = renderHook(() => useSelectedLocation({ locations: branches }))
    await waitFor(() => expect(a.result.current.id).toBe('b1'))
    history.replaceState(null, '', '/tienda?x=1')
    act(() => a.result.current.select('b2'))
    expect(localStorage.getItem('sf_sucursal')).toBe('b2')
    expect(new URL(location.href).searchParams.get('sucursal')).toBe('b2')
    expect(new URL(location.href).searchParams.get('x')).toBe('1')
    await waitFor(() => expect(b.result.current.id).toBe('b2'))
    act(() => a.result.current.clear())
    expect(localStorage.getItem('sf_sucursal')).toBeNull()
    expect(location.search).toBe('?x=1')
    expect(a.result.current.id).toBeNull()
    expect(document.cookie).toBe('')
  })

  it('ignores and forgets an id that is not among the branches; zero branches select nothing', async () => {
    localStorage.setItem('sf_sucursal', 'gone')
    const { result } = renderHook(() => useSelectedLocation({ locations: branches }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.id).toBeNull()
    await waitFor(() => expect(localStorage.getItem('sf_sucursal')).toBeNull())
    localStorage.setItem('sf_sucursal', 'b1')
    const none = renderHook(() => useSelectedLocation({ locations: [] }))
    await waitFor(() => expect(none.result.current.ready).toBe(true))
    expect(none.result.current.id).toBeNull()
    expect(localStorage.getItem('sf_sucursal')).toBe('b1') // untouched while there is nothing to validate against
  })

  it('survives blocked storage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useSelectedLocation({ locations: branches, syncUrl: false }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => result.current.select('b1'))
    expect(result.current.id).toBe('b1')
    spy.mockRestore()
  })

  it('readSelectedLocationId is pure: URL beats storage', () => {
    const store = { getItem: () => 'b1' }
    expect(readSelectedLocationId({ search: '?sucursal=b2', store })).toBe('b2')
    expect(readSelectedLocationId({ search: '', store })).toBe('b1')
    expect(readSelectedLocationId({ search: '', store: null })).toBeNull()
  })
})

describe('components render null with zero branches', () => {
  it.each([
    ['LocationList', <LocationList locations={[]} />],
    ['LocationPicker', <LocationPicker legend="x" locations={[]} />],
    ['NearestLocationForm', <NearestLocationForm locations={[]} />],
    ['LocationList (no provider)', <LocationList />],
    ['OpenStatus', <OpenStatus />],
    ['DirectionsLink', <DirectionsLink location={{ lat: null, lng: null, address: '', city: '' }} />],
    ['PickupOption', <PickupOption location={{ ...branches[2]! }} />],
    ['PickupOption sin dato', <PickupOption location={{ ...branches[0]!, pickup: undefined }} />],
  ])('%s', (_name, el) => {
    const { container } = render(el)
    expect(container.innerHTML).toBe('')
  })

  it('also with a provider whose shop has no branches', () => {
    const shop = { branches: [] } as never
    const { container } = render(
      <StorefrontProvider shop={shop}>
        <LocationList />
        <LocationPicker legend="x" />
        <NearestLocationForm />
      </StorefrontProvider>,
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('LocationList', () => {
  it('renders a list with a render prop and marks the selected item', () => {
    render(<LocationList locations={branches} selectedId="b2">{(l, s) => <b>{s.index}:{l.name}{s.selected ? '*' : ''}</b>}</LocationList>)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['0:Centro', '1:Norte*', '2:Sin recolección'])
    expect(screen.getAllByRole('listitem')[1]!.getAttribute('aria-current')).toBe('true')
    expect(screen.getAllByRole('listitem')[0]!.hasAttribute('aria-current')).toBe(false)
  })

  it('reads shop.branches from the provider by default', () => {
    render(<StorefrontProvider shop={{ branches } as never}><LocationList /></StorefrontProvider>)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('LocationPicker', () => {
  it('is a labelled radio group, uncontrolled by default', () => {
    const onChange = vi.fn()
    render(<LocationPicker legend="Elige sucursal" locations={branches} defaultValue="b1" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Elige sucursal' })).toBeTruthy()
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => [r.name, r.value, r.checked])).toEqual([['sucursal', 'b1', true], ['sucursal', 'b2', false], ['sucursal', 'b3', false]])
    fireEvent.click(radios[1]!)
    expect(onChange).toHaveBeenCalledWith('b2', branches[1])
    expect(radios[1]!.checked).toBe(true)
  })

  it('is controlled with value', () => {
    const { rerender } = render(<LocationPicker legend="x" locations={branches} value="b1" onChange={() => {}} />)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    expect((screen.getAllByRole('radio')[1] as HTMLInputElement).checked).toBe(false)
    rerender(<LocationPicker legend="x" locations={branches} value="b2" onChange={() => {}} />)
    expect((screen.getAllByRole('radio')[1] as HTMLInputElement).checked).toBe(true)
  })
})

describe('OpenStatus', () => {
  const monday = (h: number) => new Date(Date.UTC(2026, 9, 12, h + 6)) // Mon 2026-10-12, Mexico City = UTC-6
  it('says open or closed with the branch timezone and exposes data-state', () => {
    const { rerender } = render(<OpenStatus location={branches[0]!} now={monday(10)} />)
    expect(screen.getByText('Abierto').getAttribute('data-state')).toBe('open')
    rerender(<OpenStatus location={branches[0]!} now={monday(22)} />)
    expect(screen.getByText('Cerrado').getAttribute('data-state')).toBe('closed')
  })

  it('supports labels, a render prop and hours/timezone props', () => {
    render(<OpenStatus hours={branches[0]!.opening_hours!} timezone="America/Mexico_City" now={monday(10)} labels={{ open: 'Open' }} />)
    expect(screen.getByText('Open')).toBeTruthy()
    render(<OpenStatus location={branches[0]!} now={monday(10)}>{(s) => <i>{String(s.open)}|{s.closesAt}</i>}</OpenStatus>)
    expect(screen.getByText('true|2026-10-13T01:00:00.000Z')).toBeTruthy()
  })

  it('computes after mount without now, and renders null without hours or with a bad zone', async () => {
    const { container } = render(<OpenStatus location={branches[0]!} />)
    await waitFor(() => expect(container.textContent).toMatch(/Abierto|Cerrado/))
    expect(render(<OpenStatus location={branches[1]!} now={monday(10)} />).container.innerHTML).toBe('')
    expect(render(<OpenStatus hours={branches[0]!.opening_hours!} timezone="No/Zone" now={monday(10)} />).container.innerHTML).toBe('')
  })

  it('refreshes every minute', async () => {
    vi.useFakeTimers({ now: monday(18).getTime() + 50 * 60_000 }) // 18:50
    render(<OpenStatus location={branches[0]!} />)
    expect(screen.getByText('Abierto')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(11 * 60_000) })
    expect(screen.getByText('Cerrado')).toBeTruthy()
  })
})

describe('DirectionsLink', () => {
  it('links to the maps app, opening safely in a new tab', () => {
    render(<DirectionsLink location={branches[0]!} />)
    const a = screen.getByRole('link', { name: 'Cómo llegar' })
    expect(a.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=19.4326%2C-99.1332')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  it('falls back to the address, picks a provider and accepts children', () => {
    render(<DirectionsLink location={branches[2]!} provider="apple">Ir</DirectionsLink>)
    expect(screen.getByRole('link', { name: 'Ir' }).getAttribute('href')).toBe('https://maps.apple.com/?daddr=Calle%203%2C%20Guadalajara')
  })
})

describe('PickupOption', () => {
  it('shows free, fee and preparation time from the branch data', () => {
    const { container, rerender } = render(<PickupOption location={branches[0]!} locale="es-MX" />)
    expect(container.textContent).toBe('Recoge en sucursal · gratis · listo hoy')
    rerender(<PickupOption location={branches[1]!} locale="es-MX" />)
    expect(container.textContent).toBe('Recoge en sucursal · $30.00 · listo en 1 día')
  })

  it('hands the data to a render prop', () => {
    render(<PickupOption location={branches[1]!}>{(i) => <b>{i.feeText}|{i.prepDays}|{String(i.free)}</b>}</PickupOption>)
    expect(screen.getByText(/30\.00\|1\|false/)).toBeTruthy()
  })
})

describe('NearestLocationForm', () => {
  it('is a GET form with a labelled postal-code field that works without JavaScript', () => {
    render(<NearestLocationForm locations={branches} action="/sucursales" defaultValue="06000" />)
    const input = screen.getByLabelText('Código postal') as HTMLInputElement
    const form = input.closest('form')!
    expect(form.method).toBe('get')
    expect(form.getAttribute('action')).toBe('/sucursales')
    expect(input).toMatchObject({ name: 'cp', value: '06000', required: true })
    expect(input.getAttribute('autocomplete')).toBe('postal-code')
    expect(screen.getByRole('button', { name: 'Buscar sucursales' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar mi ubicación' })).toBeNull()
  })

  it('can intercept the submit to receive the postal code', () => {
    const onSubmitPostalCode = vi.fn()
    render(<NearestLocationForm locations={branches} onSubmitPostalCode={onSubmitPostalCode} />)
    fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: ' 64000 ' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Buscar sucursales' }).closest('form')!)
    expect(onSubmitPostalCode).toHaveBeenCalledWith('64000', expect.anything())
  })

  it('shows "use my location" only when supported, asks on click and reports failures', async () => {
    geoStub()
    const onLocate = vi.fn()
    const { unmount } = render(<NearestLocationForm locations={branches} onLocate={onLocate} />)
    const btn = await screen.findByRole('button', { name: 'Usar mi ubicación' })
    fireEvent.click(btn)
    await waitFor(() => expect(onLocate).toHaveBeenCalledWith({ lat: 25.67, lng: -100.31 }))
    unmount()

    geoStub((_ok, ko) => ko({ code: 1 } as GeolocationPositionError))
    render(<NearestLocationForm locations={branches} onLocate={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Usar mi ubicación' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/permiso/)
  })
})
