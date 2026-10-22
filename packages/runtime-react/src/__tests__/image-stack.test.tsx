// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ImageStack } from '../display-value'
import { ImageCell } from '../dynamic-columns'

afterEach(cleanup)

describe('ImageStack', () => {
    it('renders landscape mark with label underneath and no padded plate', () => {
        const { container, getByText } = render(
            <ImageStack src="/brands/bridgestone.png" label="BRIDGESTONE" size="sm" />,
        )
        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        expect(img?.getAttribute('src')).toBe('/brands/bridgestone.png')
        expect(img?.className).toContain('object-contain')
        expect(getByText('BRIDGESTONE')).toBeTruthy()
        // Label comes after the image in DOM order (stack, not side-by-side).
        const root = container.firstElementChild as HTMLElement
        expect(root.className).toContain('flex-col')
        // No muted card / ring wrapping the logo (row height tax).
        expect(root.querySelector('.bg-muted\\/60')).toBeNull()
        expect(root.innerHTML).not.toContain('bg-muted')
    })

    it('falls back to initials when src is missing', () => {
        const { getByText } = render(<ImageStack label="PIRELLI" size="md" />)
        // Single-token name → first letter only (getInitials).
        expect(getByText('P')).toBeTruthy()
        expect(getByText('PIRELLI')).toBeTruthy()
    })
})

describe('ImageCell stack mode', () => {
    const getImageUrl = (p: string) => p

    it('stacks image above caption when stack=true', () => {
        const { container, getByText } = render(
            <ImageCell
                value="/brands/michelin.png"
                getImageUrl={getImageUrl}
                label="MICHELIN"
                stack
            />,
        )
        expect(container.querySelector('img')?.className).toContain('object-contain')
        expect(getByText('MICHELIN')).toBeTruthy()
        expect((container.firstElementChild as HTMLElement).className).toContain('flex-col')
    })
})

describe('ImageStack: URL y errores de carga', () => {
    const SHA = 'a'.repeat(64)
    const ORG = '0170734c-f096-4ed9-b656-7a124917a257'

    it('pinta la foto con URL /storage relativa', () => {
        const url = `/storage/catalog/${ORG}/${SHA}.png`
        const { container } = render(<ImageStack src={url} label="CILINDRO MAESTRO" />)
        expect(container.querySelector('img')?.getAttribute('src')).toBe(url)
    })

    it('pinta la foto con URL absoluta', () => {
        const url = 'https://panel.example.com/storage/p.png'
        const { container } = render(<ImageStack src={url} label="X" />)
        expect(container.querySelector('img')?.getAttribute('src')).toBe(url)
    })

    it('vacío: iniciales, sin <img>', () => {
        const { container, getByText } = render(<ImageStack src="" label="CILINDRO MAESTRO" />)
        expect(container.querySelector('img')).toBeNull()
        expect(getByText('CM')).toBeTruthy()
    })

    it('error de carga sin respaldo: cae a iniciales', () => {
        const { container, getByText } = render(
            <ImageStack src="/storage/catalog/x.png" label="CILINDRO MAESTRO" />,
        )
        fireEvent.error(container.querySelector('img')!)
        expect(container.querySelector('img')).toBeNull()
        expect(getByText('CM')).toBeTruthy()
    })

    it('si el host reescribe el src al fallar (miniatura -> principal), NO cae a iniciales', () => {
        const thumb = `/storage/catalog/${ORG}/${SHA}_320.webp`
        const main = `/storage/catalog/${ORG}/${SHA}.png`
        const { container } = render(<ImageStack src={thumb} label="CILINDRO MAESTRO" />)
        const img = container.querySelector('img')!
        // el host (captura en document) cambia el src antes que React
        img.setAttribute('src', main)
        fireEvent.error(img)
        expect(container.querySelector('img')?.getAttribute('src')).toBe(main)
        // si el respaldo tambien falla y el host ya no tiene mas, entonces si
        fireEvent.error(container.querySelector('img')!)
        expect(container.querySelector('img')).toBeNull()
    })

    it('ImageCell plano: /storage, vacio y error', () => {
        const url = `/storage/catalog/${ORG}/${SHA}.png`
        const { container, rerender } = render(<ImageCell value={url} getImageUrl={(p) => p} />)
        const img = container.querySelector('img')!
        expect(img.getAttribute('src')).toBe(url)
        fireEvent.error(img)
        expect((container.querySelector('img') as HTMLElement).style.display).toBe('none')
        rerender(<ImageCell value="" getImageUrl={(p) => p} />)
        expect(container.querySelector('img')).toBeNull()
    })
})
