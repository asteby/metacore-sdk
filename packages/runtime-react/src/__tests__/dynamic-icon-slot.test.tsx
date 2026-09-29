// @vitest-environment happy-dom
//
// DynamicIcon in a table action ("icon + label" menu item or button): the
// label must not move when the glyph arrives. Before, the first render drew
// nothing (Suspense fallback null) and every remount — each time a row menu
// opened — suspended again on a fresh lazy(), so the icon popped in and
// pushed the text on every open.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { DynamicIcon } from '../dynamic-icon'

afterEach(cleanup)

function ActionItem({ icon }: { icon: string }) {
    return (
        <div role="menuitem">
            <DynamicIcon name={icon} className="mr-2 h-4 w-4" />
            Facturar
        </div>
    )
}

describe('DynamicIcon reserva su lugar', () => {
    it('el primer render ya ocupa el tamaño del ícono', () => {
        const { container } = render(<ActionItem icon="ReceiptText" />)
        const slot = container.querySelector('[role="menuitem"]')!.firstElementChild as HTMLElement
        expect(slot).not.toBeNull()
        expect(slot.getAttribute('class')).toContain('mr-2 h-4 w-4')
    })

    it('al volver a abrir el menú el ícono sale en el primer render', async () => {
        const first = render(<ActionItem icon="FileCheck" />)
        await waitFor(() => expect(first.container.querySelector('svg')).toBeTruthy())
        first.unmount()

        const again = render(<ActionItem icon="FileCheck" />)
        expect(again.container.querySelector('svg')).toBeTruthy()
        expect(again.container.querySelector('[data-glyph-pending]')).toBeNull()
    })

    it('resuelve nombres con dígitos como Building2', async () => {
        const { container } = render(<DynamicIcon name="Building2" className="h-4 w-4" />)
        await waitFor(() => expect(container.querySelector('svg')).toBeTruthy())
    })

    it('un nombre que no es de lucide no dibuja nada', () => {
        const { container } = render(<DynamicIcon name="/uploads/x.png" className="h-4 w-4" />)
        expect(container.firstChild).toBeNull()
    })
})
