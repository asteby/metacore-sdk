// @vitest-environment happy-dom
//
// IconPickerField — the `icon` form widget: lucide search grid (icon mode) and
// delegation to UploadField (image mode). UploadField is stubbed so the image
// mode asserts delegation without needing an ApiProvider.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

vi.mock('../upload-field', () => ({
    UploadField: ({ field, value }: any) => (
        <div data-testid="upload-field" data-field-key={field.key} data-value={String(value ?? '')} />
    ),
}))

import { IconPickerField, looksLikeImageValue } from '../icon-picker-field'
import type { ActionFieldDef } from '../types'

afterEach(cleanup)

const field: ActionFieldDef = { key: 'icon', label: 'Ícono', type: 'text', widget: 'icon' }

describe('IconPickerField', () => {
    // The icon mode is a combobox: the list lives in a popover that opens on
    // click. Open it, then search, then pick.
    const openPopover = () =>
        fireEvent.click(screen.getByRole('combobox'))

    it('abre el popover, busca "credit" y al click emite onChange con el nombre', () => {
        const onChange = vi.fn()
        render(<IconPickerField field={field} value="" onChange={onChange} />)
        openPopover()
        fireEvent.change(screen.getByLabelText('Buscar ícono'), { target: { value: 'credit' } })
        const option = screen.getByRole('option', { name: 'CreditCard' })
        fireEvent.click(option)
        expect(onChange).toHaveBeenCalledWith('CreditCard')
    })

    it('el trigger muestra el ícono y nombre seleccionado', () => {
        render(<IconPickerField field={field} value="CreditCard" onChange={() => {}} />)
        // The combobox trigger shows the selected name even before opening.
        expect(screen.getByRole('combobox').textContent).toContain('CreditCard')
    })

    it('pagina: arranca con a lo sumo 60 opciones visibles', () => {
        render(<IconPickerField field={field} value="" onChange={() => {}} />)
        openPopover()
        expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(60)
    })

    it('modo imagen delega a UploadField con los mismos props', () => {
        render(<IconPickerField field={field} value="" onChange={() => {}} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Imagen' }))
        const stub = screen.getByTestId('upload-field')
        expect(stub.getAttribute('data-field-key')).toBe('icon')
    })

    it('arranca en modo Imagen cuando el valor parece path/URL', () => {
        render(<IconPickerField field={field} value="/uploads/logo.png" onChange={() => {}} />)
        expect(screen.getByTestId('upload-field').getAttribute('data-value')).toBe('/uploads/logo.png')
    })
})

describe('looksLikeImageValue', () => {
    it('distingue paths/URLs de nombres lucide', () => {
        expect(looksLikeImageValue('/uploads/a.png')).toBe(true)
        expect(looksLikeImageValue('logo.png')).toBe(true)
        expect(looksLikeImageValue('https://x/y')).toBe(true)
        expect(looksLikeImageValue('CreditCard')).toBe(false)
        expect(looksLikeImageValue('credit-card')).toBe(false)
        expect(looksLikeImageValue('')).toBe(false)
    })
})
