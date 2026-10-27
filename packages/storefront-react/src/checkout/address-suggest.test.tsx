// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { StorefrontProvider } from '../context.js'
import { ADDRESS_FILL_EVENT_FLAG, AddressFields, isAddressFillEvent, type AddressSuggestResult, type PostalCodeInfo, type SuggestAddress } from './index.js'
import { ADDRESS_SUGGEST_COOLDOWN_MS, ADDRESS_SUGGEST_DEBOUNCE_MS, ADDRESS_SUGGEST_TIMEOUT_MS } from './address-suggest.js'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const AXE = { rules: { 'color-contrast': { enabled: false } } }
const sg = (over: Record<string, unknown> = {}) => ({
  id: 'osm:W1',
  label: 'Av. Insurgentes Sur 123, Del Valle, Benito Juárez',
  street: 'Avenida Insurgentes Sur',
  house_number: '123',
  neighborhood: 'Del Valle',
  city: 'Benito Juárez',
  province: 'Ciudad de México',
  zip: '03100',
  country: 'MX',
  lat: 19.39,
  lng: -99.17,
  source: 'geo_photon',
  ...over,
})
const OPTIONS = [sg(), sg({ id: 'osm:W2', label: 'Insurgentes Sur 99, Del Valle', house_number: '99', neighborhood: 'Insurgentes Mixcoac' }), sg({ id: 'osm:W3', label: 'Insurgentes Norte 5', street: 'Insurgentes Norte', house_number: '5', neighborhood: undefined })]

const catalog = async (zip: string): Promise<PostalCodeInfo | null> =>
  zip === '03100' ? { province: 'Ciudad de México', city: 'Benito Juárez', neighborhoods: ['Del Valle Centro', 'Del Valle Norte', 'Insurgentes Mixcoac'] } : null

function Form(p: { suggest?: SuggestAddress | false; lookup?: typeof catalog; locale?: string; onChosen?: (s: unknown) => void; defaults?: { zip?: string } }) {
  return (
    <form onSubmit={(e) => e.preventDefault()} data-testid="form">
      <AddressFields
        countryCode="MX"
        hideResolvedFields={false}
        lockProvinceOnFill={false}
        postalCode={{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric' }}
        lookupPostalCode={p.lookup ?? catalog}
        {...(p.suggest !== undefined ? { suggestAddress: p.suggest } : {})}
        {...(p.locale ? { locale: p.locale } : {})}
        {...(p.onChosen ? { onSuggestionChosen: p.onChosen as never } : {})}
        {...(p.defaults ? { defaults: p.defaults } : {})}
      />
      <button type="submit">Continuar</button>
    </form>
  )
}

const line = () => screen.getByLabelText('Calle y número') as HTMLInputElement
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } })
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
const result = (suggestions: unknown[], extra: Partial<AddressSuggestResult> = {}) => ({ suggestions, available: true, ...extra }) as AddressSuggestResult

describe('AddressFields street suggestions', () => {
  it('is the plain input it always was when there is no source: no combobox, nothing asked', async () => {
    const { container } = render(<Form />)
    type(line(), 'Insurgentes Sur 123')
    await settle(2000)
    expect(line().getAttribute('role')).toBeNull()
    expect(container.querySelector('[data-sf-address-suggest]')).toBeNull()
    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('asks nothing under 3 characters, waits 250 ms of stillness, and asks once with the last text', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => result(OPTIONS))
    render(<Form suggest={suggest} />)
    type(line(), 'In')
    await settle(1000)
    expect(suggest).not.toHaveBeenCalled()
    type(line(), 'Ins')
    await settle(ADDRESS_SUGGEST_DEBOUNCE_MS - 1)
    type(line(), 'Insu')
    await settle(ADDRESS_SUGGEST_DEBOUNCE_MS - 1)
    expect(suggest).not.toHaveBeenCalled()
    type(line(), '  Insurgentes   Sur ')
    await settle(ADDRESS_SUGGEST_DEBOUNCE_MS)
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest.mock.calls[0]![0]).toBe('Insurgentes Sur')
    // Backspacing under the minimum cancels what is pending and forgets the list.
    type(line(), 'In')
    await settle(1000)
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('never asks while the typed text is blank, and never for the same text twice in a row', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => result(OPTIONS))
    render(<Form suggest={suggest} />)
    type(line(), '      ')
    await settle(1000)
    type(line(), 'Reforma 100')
    await settle(300)
    type(line(), 'Reforma  100 ')
    await settle(300)
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it('passes the postal code and country the form has right now', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => result(OPTIONS))
    render(<Form suggest={suggest} locale="en-US" />)
    fireEvent.input(screen.getByLabelText('Postal code'), { target: { value: '03100' } })
    type(screen.getByLabelText('Street and number'), 'Insurgentes')
    await settle(300)
    const ctx = suggest.mock.calls[0]![1]
    expect(ctx.zip).toBe('03100')
    expect(ctx.country).toBe('MX')
    expect(ctx.locale).toBe('en-US')
    expect(ctx.signal).toBeInstanceOf(AbortSignal)
  })

  it('is an ARIA combobox with a listbox, options, a live region and the OSM attribution', async () => {
    render(<Form suggest={async () => result(OPTIONS)} />)
    type(line(), 'Insurgentes')
    await settle(300)
    const input = line()
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('listbox', { name: 'Sugerencias de dirección' })
    expect(input.getAttribute('aria-controls')).toBe(list.id)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(OPTIONS.map((o) => o.label))
    expect(document.querySelector('[data-sf-suggest-status]')!.textContent).toContain('3 sugerencias')
    const link = screen.getByRole('link', { name: '© OpenStreetMap contributors' })
    expect(link.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('arrow keys move through the options (wrapping), Escape closes, and Enter without a highlighted option is the form\'s', async () => {
    const submit = vi.fn((e: Event) => e.preventDefault())
    const { getByTestId } = render(<Form suggest={async () => result(OPTIONS)} />)
    getByTestId('form').addEventListener('submit', submit)
    type(line(), 'Insurgentes')
    await settle(300)
    // Nothing highlighted yet: Enter is NOT swallowed.
    expect(fireEvent.keyDown(line(), { key: 'Enter' })).toBe(true)
    const opts = () => screen.getAllByRole('option')
    expect(fireEvent.keyDown(line(), { key: 'ArrowDown' })).toBe(false)
    expect(line().getAttribute('aria-activedescendant')).toBe(opts()[0]!.id)
    expect(opts()[0]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    expect(line().getAttribute('aria-activedescendant')).toBe(opts()[0]!.id)
    fireEvent.keyDown(line(), { key: 'ArrowUp' })
    expect(line().getAttribute('aria-activedescendant')).toBe(opts()[2]!.id)
    expect(fireEvent.keyDown(line(), { key: 'Escape' })).toBe(false)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(line().getAttribute('aria-expanded')).toBe('false')
    expect(line().getAttribute('aria-activedescendant')).toBeNull()
    // Escape with the list closed is not swallowed (a surrounding dialog may use it).
    expect(fireEvent.keyDown(line(), { key: 'Escape' })).toBe(true)
  })

  it('Enter on a highlighted option fills street and number and announces the choice; Tab just leaves', async () => {
    const chosen = vi.fn()
    render(<Form suggest={async () => result(OPTIONS)} onChosen={chosen} />)
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    fireEvent.keyDown(line(), { key: 'Enter' })
    expect(line().value).toBe('Avenida Insurgentes Sur 123')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.querySelector('[data-sf-suggest-status]')!.textContent).toBe('Dirección elegida: Av. Insurgentes Sur 123, Del Valle, Benito Juárez')
    expect(chosen).toHaveBeenCalledTimes(1)
    expect(chosen.mock.calls[0]![0]).toMatchObject({ id: 'osm:W1', lat: 19.39, lng: -99.17, source: 'geo_photon' })
    // The value is what the form submits.
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).get('address1')).toBe('Avenida Insurgentes Sur 123')
    type(line(), 'Insurgentes N')
    await settle(300)
    fireEvent.keyDown(line(), { key: 'Tab' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(line().value).toBe('Insurgentes N')
  })

  it('a click (mousedown) chooses without taking focus from the input', async () => {
    render(<Form suggest={async () => result(OPTIONS)} />)
    line().focus()
    type(line(), 'Insurgentes')
    await settle(300)
    const opt = screen.getAllByRole('option')[2]!
    expect(fireEvent.mouseDown(opt)).toBe(false) // default prevented: no blur
    expect(line().value).toBe('Insurgentes Norte 5')
    expect(document.activeElement).toBe(line())
  })

  it('fills the postal code only when empty and then runs the usual lookup, never state or city', async () => {
    const lookup = vi.fn(catalog)
    render(<Form suggest={async () => result([sg()])} lookup={lookup} />)
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    fireEvent.keyDown(line(), { key: 'Enter' })
    const zip = screen.getByLabelText('Código postal') as HTMLInputElement
    expect(zip.value).toBe('03100')
    expect(lookup).toHaveBeenCalledWith('03100')
    await settle(0)
    // The lookup (the catalog) filled state and city; the suggestion's own city/province played no part.
    expect((screen.getByLabelText('Estado') as HTMLInputElement).value).toBe('Ciudad de México')
    expect((screen.getByLabelText('Ciudad o municipio') as HTMLInputElement).value).toBe('Benito Juárez')
  })

  it('does not touch a postal code the buyer already typed, and ignores a candidate of another code', async () => {
    const lookup = vi.fn(catalog)
    const chosen = vi.fn()
    render(<Form suggest={async () => result([sg({ zip: '03101', id: 'x', label: 'Otra 1', street: 'Otra', house_number: '1' }), sg()])} lookup={lookup} onChosen={chosen} />)
    const zip = screen.getByLabelText('Código postal') as HTMLInputElement
    type(zip, '03100')
    await settle(0)
    lookup.mockClear()
    type(line(), 'Otra')
    await settle(300)
    // Another postal code than the form's: nothing is applied, nothing is announced as chosen.
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!)
    expect(line().value).toBe('Otra')
    expect(chosen).not.toHaveBeenCalled()
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.mouseDown(screen.getAllByRole('option')[1]!)
    expect(zip.value).toBe('03100')
    expect(lookup).not.toHaveBeenCalled()
    expect(line().value).toBe('Avenida Insurgentes Sur 123')
  })

  it('takes the colonia from the postal code\'s catalog only: its spelling, never over the buyer\'s, never an unknown one', async () => {
    // 1. Matches a catalog colonia: filled with the catalog spelling.
    const view = render(<Form suggest={async () => result([sg({ neighborhood: 'insurgentes mixcoac' })])} />)
    type(screen.getByLabelText('Código postal'), '03100')
    await settle(0)
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!)
    expect((screen.getByLabelText(/Colonia/) as HTMLInputElement).value).toBe('Insurgentes Mixcoac')
    view.unmount()
    // 2. Not in the catalog: left alone (the catalog has colonias for this code).
    render(<Form suggest={async () => result([sg({ neighborhood: 'Colonia Inventada' })])} />)
    type(screen.getByLabelText('Código postal'), '03100')
    await settle(0)
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!)
    expect((screen.getByLabelText(/Colonia/) as HTMLInputElement).value).toBe('')
  })

  it('does not overwrite a colonia the buyer typed', async () => {
    render(<Form suggest={async () => result([sg({ neighborhood: 'Insurgentes Mixcoac' })])} />)
    type(screen.getByLabelText('Código postal'), '03100')
    await settle(0)
    const hood = screen.getByLabelText(/Colonia/) as HTMLInputElement
    hood.dataset.sfUserEdited = '1'
    hood.value = 'La mía'
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!)
    expect(hood.value).toBe('La mía')
  })

  it('the events it dispatches are fill events, not typing: choosing never asks again', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => result([sg()]))
    render(<Form suggest={suggest} />)
    const seen: boolean[] = []
    screen.getByTestId('form').addEventListener('input', (e) => seen.push(isAddressFillEvent(e)), true)
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!)
    await settle(2000)
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(seen.filter(Boolean).length).toBeGreaterThan(0)
    expect(ADDRESS_FILL_EVENT_FLAG).toBe('sfSynthetic')
  })

  it('waits at most 800 ms and then leaves the field plain; a late answer is discarded', async () => {
    let resolveLate: (r: AddressSuggestResult) => void = () => {}
    const suggest = vi.fn<SuggestAddress>(() => new Promise<AddressSuggestResult>((r) => (resolveLate = r)))
    render(<Form suggest={suggest} />)
    type(line(), 'Insurgentes')
    await settle(ADDRESS_SUGGEST_DEBOUNCE_MS)
    const signal = suggest.mock.calls[0]![1].signal
    await settle(ADDRESS_SUGGEST_TIMEOUT_MS)
    expect(signal.aborted).toBe(true)
    resolveLate(result(OPTIONS))
    await settle(0)
    expect(screen.queryByRole('listbox')).toBeNull()
    // Still a working input.
    type(line(), 'Insurgentes Sur 1')
    expect(line().value).toBe('Insurgentes Sur 1')
  })

  it('a function that rejects or answers degraded closes quietly; after two failures it rests 30 s', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => {
      throw new Error('boom')
    })
    render(<Form suggest={suggest} />)
    for (const t of ['Reforma 1', 'Reforma 12']) {
      type(line(), t)
      await settle(300)
    }
    expect(suggest).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('listbox')).toBeNull()
    type(line(), 'Reforma 123')
    await settle(2000)
    expect(suggest).toHaveBeenCalledTimes(2)
    await settle(ADDRESS_SUGGEST_COOLDOWN_MS)
    type(line(), 'Reforma 1234')
    await settle(300)
    expect(suggest).toHaveBeenCalledTimes(3)
    // degraded: same quiet close, no error text anywhere.
    const { container } = render(<Form suggest={async () => result([], { degraded: true })} />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('discards a stale answer that arrives after a newer query', async () => {
    const resolvers: Array<(r: AddressSuggestResult) => void> = []
    const suggest = vi.fn<SuggestAddress>(() => new Promise<AddressSuggestResult>((r) => resolvers.push(r)))
    render(<Form suggest={suggest} />)
    type(line(), 'Reforma 1')
    await settle(300)
    type(line(), 'Reforma 12')
    await settle(300)
    expect(suggest).toHaveBeenCalledTimes(2)
    resolvers[1]!(result([sg({ label: 'Reforma 12 nueva', street: 'Reforma', house_number: '12' })]))
    await settle(0)
    resolvers[0]!(result([sg({ label: 'Reforma 1 vieja' })]))
    await settle(0)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Reforma 12 nueva'])
  })

  it('available:false turns the field back into a plain input for good', async () => {
    const suggest = vi.fn<SuggestAddress>(async () => result([], { available: false }))
    const { container } = render(<Form suggest={suggest} />)
    type(line(), 'Insurgentes')
    await settle(300)
    expect(line().getAttribute('role')).toBeNull()
    expect(container.querySelector('[data-sf-address-suggest]')).toBeNull()
    type(line(), 'Insurgentes Sur')
    await settle(2000)
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it('by default asks the market through the StorefrontProvider client; suggestAddress={false} turns it off', async () => {
    const addressSuggest = vi.fn(async () => ({ suggestions: [sg()], available: true }))
    const client = { postalCode: catalog, addressSuggest } as never
    const { unmount } = render(
      <StorefrontProvider client={client}>
        <Form locale="es-MX" />
      </StorefrontProvider>,
    )
    type(screen.getByLabelText('Código postal'), '03100')
    type(line(), 'Insurgentes')
    await settle(300)
    expect(addressSuggest).toHaveBeenCalledTimes(1)
    const [params, opts] = addressSuggest.mock.calls[0] as unknown as [Record<string, unknown>, { signal: AbortSignal }]
    expect(params).toEqual({ q: 'Insurgentes', country: 'MX', zip: '03100', locale: 'es' })
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    unmount()
    addressSuggest.mockClear()
    render(
      <StorefrontProvider client={client}>
        <Form suggest={false} />
      </StorefrontProvider>,
    )
    type(line(), 'Insurgentes')
    await settle(2000)
    expect(addressSuggest).not.toHaveBeenCalled()
    expect(line().getAttribute('role')).toBeNull()
  })

  it('a client without addressSuggest (an older SDK object) leaves the field plain', async () => {
    render(
      <StorefrontProvider client={{ postalCode: catalog } as never}>
        <Form />
      </StorefrontProvider>,
    )
    expect(line().getAttribute('role')).toBeNull()
  })

  it('a market with no provider is learned once per client: another form does not ask', async () => {
    const addressSuggest = vi.fn(async () => ({ suggestions: [], available: false }))
    const client = { postalCode: catalog, addressSuggest } as never
    const a = render(
      <StorefrontProvider client={client}>
        <Form />
      </StorefrontProvider>,
    )
    type(line(), 'Insurgentes')
    await settle(300)
    expect(addressSuggest).toHaveBeenCalledTimes(1)
    a.unmount()
    render(
      <StorefrontProvider client={client}>
        <Form />
      </StorefrontProvider>,
    )
    type(line(), 'Insurgentes')
    await settle(300)
    expect(addressSuggest).toHaveBeenCalledTimes(1)
  })

  it('speaks English with locale="en"', async () => {
    render(<Form suggest={async () => result(OPTIONS)} locale="en-US" />)
    type(screen.getByLabelText('Street and number'), 'Insurgentes')
    await settle(300)
    expect(screen.getByRole('listbox', { name: 'Address suggestions' })).toBeTruthy()
    expect(document.querySelector('[data-sf-suggest-status]')!.textContent).toContain('3 suggestions')
  })

  it('suggestAttribution={false} hides the attribution, a node replaces it', async () => {
    const { rerender } = render(<AddressFields countryCode="MX" suggestAddress={async () => result(OPTIONS)} suggestAttribution={false} />)
    type(line(), 'Insurgentes')
    await settle(300)
    expect(document.querySelector('[data-sf-attribution]')).toBeNull()
    rerender(<AddressFields countryCode="MX" suggestAddress={async () => result(OPTIONS)} suggestAttribution={<span>Datos propios</span>} />)
    type(line(), 'Insurgentes S')
    await settle(300)
    expect(document.querySelector('[data-sf-attribution]')!.textContent).toBe('Datos propios')
  })

  it('passes axe with the list open, with an option highlighted and with the plain field', async () => {
    const { container } = render(<Form suggest={async () => result(OPTIONS)} />)
    vi.useRealTimers()
    expect((await axe.run(container, AXE)).violations).toEqual([])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    type(line(), 'Insurgentes')
    await settle(300)
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    vi.useRealTimers()
    const open = await axe.run(container, AXE)
    expect(open.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })
})
