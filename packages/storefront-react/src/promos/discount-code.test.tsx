// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderToString } from 'react-dom/server'
import type { CartPromotions } from '@asteby/storefront'
import { DiscountCodeForm } from './index.js'

afterEach(cleanup)

async function noViolations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { region: { enabled: false } } })
  expect(r.violations.map((v) => v.id)).toEqual([])
}

describe('DiscountCodeForm', () => {
  it('sin cupón: campo con etiqueta, intent oculto y botón Aplicar (funciona sin JavaScript)', async () => {
    const { container } = render(<DiscountCodeForm codes={[]} locale="es-MX" />)
    const input = screen.getByLabelText('Cupón de descuento') as HTMLInputElement
    expect(input.name).toBe('code')
    expect(container.querySelector('input[type=hidden][name=intent]')?.getAttribute('value')).toBe('discount')
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy()
    await noViolations(container)
  })

  it('cupón aplicado: lo anuncia y ofrece Quitar (post con código vacío)', async () => {
    const { container } = render(<DiscountCodeForm codes={[{ code: 'PROTEK10', applicable: true }]} locale="es-MX" />)
    expect(screen.getByRole('status').textContent).toBe('Cupón PROTEK10 aplicado.')
    const remove = screen.getByRole('button', { name: 'Quitar PROTEK10' })
    const form = remove.closest('form')!
    expect((form.querySelector('input[name=code]') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Cupón de descuento') as HTMLInputElement).defaultValue).toBe('PROTEK10')
    await noViolations(container)
  })

  it('rechazado: muestra el motivo de OPS como alerta y marca el campo inválido', async () => {
    const { container } = render(<DiscountCodeForm codes={[{ code: 'VIEJO', applicable: false, reason: 'expired' }]} locale="es-MX" />)
    expect(screen.getByRole('alert').textContent).toBe('El cupón VIEJO ya venció.')
    const input = screen.getByLabelText('Cupón de descuento')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain('ya venció')
    await noViolations(container)
  })

  it('válido pendiente de envío y formato inválido sin ir al servidor', () => {
    render(<DiscountCodeForm codes={[{ code: 'ENVIO', applicable: true, reason: 'no_shipping_selected' }]} locale="en" />)
    expect(screen.getByRole('status').textContent).toContain('home delivery')
    const input = screen.getByLabelText('Discount code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10% off' } })
    const submitted = fireEvent.submit(input.closest('form')!)
    expect(submitted).toBe(false) // preventDefault
    expect(screen.getByRole('alert').textContent).toContain('valid code')
  })

  it('ocupado: deshabilita el botón y renderiza en el servidor', () => {
    render(<DiscountCodeForm codes={[]} busy locale="es-MX" hideLabel />)
    const b = screen.getByRole('button', { name: 'Aplicando…' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(renderToString(<DiscountCodeForm codes={[{ code: 'A1', applicable: true }]} locale="es-MX" />)).toContain('Cupón A1 aplicado.')
  })
})

describe('DiscountCodeForm con bloqueo de cupones', () => {
  const promos = (blocks_codes: boolean) => ({ version: 1, blocks_codes }) as unknown as CartPromotions
  it('no pinta el campo cuando la promoción vigente bloquea cupones', () => {
    const { container } = render(<DiscountCodeForm codes={[]} locale="es-MX" promotions={promos(true)} />)
    expect(container.innerHTML).toBe('')
  })
  it('con blocks_codes=false o sin promociones el campo sigue ahí', () => {
    const a = render(<DiscountCodeForm codes={[]} locale="es-MX" promotions={promos(false)} />)
    expect(screen.getByLabelText('Cupón de descuento')).toBeTruthy()
    a.unmount()
    render(<DiscountCodeForm codes={[]} locale="es-MX" />)
    expect(screen.getByLabelText('Cupón de descuento')).toBeTruthy()
  })
  it('muestra el motivo promo_blocks_codes si el servidor rechaza un código ya guardado', () => {
    render(<DiscountCodeForm codes={[{ code: 'OTONO10', applicable: false, reason: 'promo_blocks_codes' }]} locale="es-MX" />)
    expect(screen.getByRole('alert').textContent).toContain('no se aceptan cupones')
  })
})
