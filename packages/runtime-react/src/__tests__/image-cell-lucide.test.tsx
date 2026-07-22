// @vitest-environment happy-dom
//
// ImageCell — an `image` cell whose value is a lucide icon name (PascalCase or
// kebab, as stored by the `icon` form widget) renders the glyph instead of a
// broken <img>; real paths/urls keep rendering an <img>.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ImageCell } from '../dynamic-columns'
import { isLucideIconName, resolveLucideIconName } from '../dynamic-icon'

afterEach(cleanup)

const getImageUrl = (p: string) => `/img${p}`

describe('ImageCell con nombre lucide', () => {
    it('renderiza el ícono (svg) para un nombre PascalCase, sin <img>', () => {
        const { container } = render(<ImageCell value="CreditCard" getImageUrl={getImageUrl} />)
        expect(container.querySelector('svg')).toBeTruthy()
        expect(container.querySelector('img')).toBeNull()
    })

    it('renderiza el ícono también para el slug kebab "credit-card"', () => {
        const { container } = render(<ImageCell value="credit-card" getImageUrl={getImageUrl} />)
        expect(container.querySelector('svg')).toBeTruthy()
        expect(container.querySelector('img')).toBeNull()
    })

    it('un path real sigue renderizando <img> con getImageUrl aplicado', () => {
        const { container } = render(<ImageCell value="/uploads/x.png" getImageUrl={getImageUrl} />)
        const img = container.querySelector('img')
        expect(img?.getAttribute('src')).toBe('/img/uploads/x.png')
    })

    it('valor vacío cae al guion', () => {
        const { container } = render(<ImageCell value="" getImageUrl={getImageUrl} />)
        expect(container.textContent).toBe('-')
    })
})

describe('resolveLucideIconName / isLucideIconName', () => {
    it('normaliza kebab a PascalCase', () => {
        expect(resolveLucideIconName('credit-card')).toBe('CreditCard')
        expect(resolveLucideIconName('CreditCard')).toBe('CreditCard')
    })
    it('rechaza paths, vacíos y el base "Icon"', () => {
        expect(resolveLucideIconName('/a/b.png')).toBeNull()
        expect(resolveLucideIconName('logo.png')).toBeNull()
        expect(resolveLucideIconName('')).toBeNull()
        expect(resolveLucideIconName('Icon')).toBeNull()
        expect(isLucideIconName('no-such-icon-xyz')).toBe(false)
    })
})
