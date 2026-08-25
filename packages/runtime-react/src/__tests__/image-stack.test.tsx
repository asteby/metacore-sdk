// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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
