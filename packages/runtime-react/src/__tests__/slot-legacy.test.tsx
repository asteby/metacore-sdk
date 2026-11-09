// @vitest-environment happy-dom
// Regresion de <Slot> (API historica): no cambia al existir <AddonSlot>.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Slot, slotRegistry } from '../slot'

describe('<Slot> legacy', () => {
    it('esparce props tal cual, incluso una clave llamada "props", sin wrapper', () => {
        const name = `legacy.props.${Math.random()}`
        const C = (p: any) => <b data-testid="c">{String(p.props)}|{String(p.x)}</b>
        const off = slotRegistry.register(name, C)
        const { container } = render(<Slot name={name} props={{ props: 'a', x: 1 }} />)
        expect(screen.getByTestId('c').textContent).toBe('a|1')
        expect(container.firstElementChild?.tagName).toBe('B')
        off()
    })

    it('un error de render NO se traga (se propaga como siempre)', () => {
        const name = `legacy.err.${Math.random()}`
        const Boom = () => {
            throw new Error('boom')
        }
        const off = slotRegistry.register(name, Boom)
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Slot name={name} />)).toThrow('boom')
        spy.mockRestore()
        off()
    })

    it('sin contribuciones pinta el fallback', () => {
        render(<Slot name={`legacy.none.${Math.random()}`} fallback={<i data-testid="fb" />} />)
        expect(screen.getByTestId('fb')).toBeTruthy()
    })
})
