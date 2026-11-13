// @vitest-environment happy-dom
//
// Rich cells — `chips` (a list as colored badges), the multi-swatch `color` (`display_config.also`) and `meter`
// (a number with a bar when a ceiling is known). They are what lets an addon table show what an instance exposes and its
// brand colors instead of a bare JSON dot and one color column per swatch.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ChipsCell, MeterCell, SwatchCell, chipItems, validSwatches } from '../rich-cells'

afterEach(cleanup)

describe('chipItems', () => {
    it('acepta arreglos de strings, objetos y CSV; descarta vacíos', () => {
        expect(chipItems(['a', 'b'])).toEqual([{ value: 'a' }, { value: 'b' }])
        expect(chipItems(['a', null, '', undefined, 'b'])).toEqual([{ value: 'a' }, { value: 'b' }])
        expect(chipItems('x, y ,,z')).toEqual([{ value: 'x' }, { value: 'y' }, { value: 'z' }])
        expect(chipItems([{ key: 'k', label: 'Etiqueta', color: 'green', icon: 'Check' }])).toEqual([
            { value: 'k', label: 'Etiqueta', color: 'green', icon: 'Check' },
        ])
        expect(chipItems(null)).toEqual([])
        expect(chipItems(42)).toEqual([])
        expect(chipItems({})).toEqual([])
    })
})

describe('ChipsCell', () => {
    it('pinta un chip por valor y usa labels (con traducción) en lugar del valor crudo', () => {
        const t = (k: string, o?: { defaultValue?: string }) => (k === 'addons.all' ? 'Todos los públicos' : (o?.defaultValue ?? k))
        const { container } = render(<ChipsCell value={['*']} labels={{ '*': 'addons.all' }} t={t} />)
        expect(container.textContent).toBe('Todos los públicos')
        expect(container.textContent).not.toContain('*')
    })

    it('muestra max chips y pliega el resto en «+N» con el detalle en el title', () => {
        const { container } = render(<ChipsCell value={['a', 'b', 'c', 'd', 'e']} max={2} />)
        const over = container.querySelector('[data-chips-overflow]')
        expect(over?.textContent).toBe('+3')
        expect(over?.getAttribute('title')).toBe('c, d, e')
        expect(container.textContent).toContain('a')
        expect(container.textContent).not.toContain('e,')
    })

    it('por omisión muestra 3; un max inválido vuelve a 3', () => {
        const { container } = render(<ChipsCell value={['a', 'b', 'c', 'd']} max={0} />)
        expect(container.querySelector('[data-chips-overflow]')?.textContent).toBe('+1')
    })

    it('sin elementos cae al guion', () => {
        expect(render(<ChipsCell value={[]} />).container.textContent).toBe('-')
        cleanup()
        expect(render(<ChipsCell value={null} />).container.textContent).toBe('-')
    })

    it('el color configurado por valor llega al chip', () => {
        const { container } = render(<ChipsCell value={['pitsline']} colors={{ pitsline: '#f97316' }} />)
        const badge = container.querySelector('[class*="border-0"]') as HTMLElement | null
        expect(badge).toBeTruthy()
        expect(badge!.getAttribute('style') ?? '').not.toBe('')
    })
})

describe('SwatchCell / color.also', () => {
    it('pinta un cuadro por color y el hex del principal', () => {
        const { container } = render(<SwatchCell colors={['#0F766E', '#F59E0B']} />)
        expect(container.querySelectorAll('[data-swatch]').length).toBe(2)
        expect(container.textContent).toBe('#0F766E')
        expect(container.firstElementChild?.getAttribute('title')).toBe('#0F766E · #F59E0B')
    })

    it('descarta valores que no son un hex (nunca se inyecta CSS arbitrario) y no pinta nada si no queda ninguno', () => {
        expect(validSwatches(['#fff', 'red', 'url(javascript:x)', '#12345', '#0F766E', null, 3])).toEqual(['#fff', '#0F766E'])
        const { container } = render(<SwatchCell colors={['red', 'expression(1)', '']} />)
        expect(container.textContent).toBe('-')
        expect(container.querySelector('[data-swatch]')).toBeNull()
    })

    it('si falta el principal igual muestra el de acento', () => {
        const { container } = render(<SwatchCell colors={['', '#F59E0B']} />)
        expect(container.querySelectorAll('[data-swatch]').length).toBe(1)
        expect(container.textContent).toBe('#F59E0B')
    })
})

describe('MeterCell', () => {
    it('con techo muestra barra y el número formateado', () => {
        const { container } = render(<MeterCell value={250} max={1000} locale="en-US" unit="Sparks" />)
        expect(container.textContent).toBe('250 Sparks')
        expect(container.querySelector('[role="progressbar"]')).toBeTruthy()
    })

    it('sin techo (o techo 0) es solo el número, sin barra', () => {
        for (const max of [undefined, null, 0, -5, 'x']) {
            const { container } = render(<MeterCell value={1234} max={max} locale="en-US" />)
            expect(container.textContent).toBe('1,234')
            expect(container.querySelector('[role="progressbar"]')).toBeNull()
            cleanup()
        }
    })

    it('acepta números como string y limita la barra a 0-100', () => {
        const { container } = render(<MeterCell value="2000" max="1000" locale="en-US" />)
        expect(container.textContent).toBe('2,000')
        const bar = container.querySelector('[role="progressbar"]')
        expect(bar?.getAttribute('aria-valuenow') ?? '100').toBe('100')
    })

    it('un valor que no es número cae al guion', () => {
        for (const v of [null, undefined, '', 'abc', NaN]) {
            expect(render(<MeterCell value={v} max={10} />).container.textContent).toBe('-')
            cleanup()
        }
    })
})
