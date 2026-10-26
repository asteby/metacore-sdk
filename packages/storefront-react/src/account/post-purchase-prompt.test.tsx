// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { CustomerCapabilities } from '@asteby/storefront'
import { PostPurchaseAccountPrompt, postPurchaseAccountPromptMessages } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const full: CustomerCapabilities = { password: true, email_verification: true, otp_channels: ['email'] }
const basic: CustomerCapabilities = { password: true, email_verification: false, otp_channels: [] }
const otpOnly: CustomerCapabilities = { password: false, email_verification: false, otp_channels: ['email'] }
const none: CustomerCapabilities = { password: false, email_verification: false, otp_channels: [] }

describe('<PostPurchaseAccountPrompt />', () => {
  it('renders the invitation with the receipt email as a hidden, non-editable field and asks only for a password', () => {
    const { container } = render(<PostPurchaseAccountPrompt email="Ana@Correo.com" capabilities={full} next="/cuenta/pedidos" />)
    expect(screen.getByRole('heading', { name: 'Crea tu cuenta para seguir tu pedido' })).toBeTruthy()
    const email = container.querySelector('[name=email]') as HTMLInputElement
    expect(email.type).toBe('hidden')
    expect(email.value).toBe('ana@correo.com')
    expect(container.textContent).toContain('ana@correo.com')
    expect(container.querySelectorAll('input:not([type=hidden])')).toHaveLength(1)
    expect(container.querySelector('[name=password]')!.getAttribute('autocomplete')).toBe('new-password')
    expect(container.querySelector('[name=address1]')).toBeNull()
    expect(container.querySelector('[name=phone]')).toBeNull()
    expect((container.querySelector('[name=next]') as HTMLInputElement).value).toBe('/cuenta/pedidos')
    const submit = container.querySelector('[data-sf-ppa-submit]') as HTMLButtonElement
    expect([submit.name, submit.value]).toEqual(['intent', 'register'])
    expect(container.querySelector('form')!.getAttribute('method')).toBe('post')
  })

  it('promises the order in the history only when the mailbox gets verified', () => {
    const a = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={full} />)
    expect(a.container.querySelector('[data-sf-ppa-benefit]')!.textContent).toContain('verás aquí tu pedido')
    a.unmount()
    const b = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={basic} />)
    expect(b.container.querySelector('[data-sf-ppa-benefit]')!.textContent).not.toContain('tu pedido y su envío')
  })

  it('renders nothing without a valid receipt email or without a way to sign up', () => {
    for (const email of [undefined, null, '', 'no-es-correo']) {
      const r = render(<PostPurchaseAccountPrompt email={email} capabilities={full} />)
      expect(r.container.innerHTML).toBe('')
      r.unmount()
    }
    expect(render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={none} />).container.innerHTML).toBe('')
  })

  it('uses the email code in a store without passwords', () => {
    const { container } = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={otpOnly} />)
    expect(container.querySelector('[name=password]')).toBeNull()
    expect((container.querySelector('[data-sf-ppa-submit]') as HTMLButtonElement).value).toBe('otp-request')
  })

  it('moves to the code step the action asks for, carrying the email', () => {
    const a = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={full} data={{ ok: true, step: 'verify', email: 'a@b.co' }} />)
    expect(a.container.querySelector('[data-sf-ppa-view]')!.getAttribute('data-sf-ppa-view')).toBe('verify')
    expect(a.container.querySelector('[name=code]')!.getAttribute('autocomplete')).toBe('one-time-code')
    expect(a.container.querySelector('[name=password]')).toBeNull()
    expect((a.container.querySelector('[data-sf-ppa-submit]') as HTMLButtonElement).value).toBe('verify')
    expect(a.container.querySelector('[data-sf-ppa-notice]')!.textContent).toContain('a@b.co')
    a.unmount()
    const b = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={otpOnly} data={{ ok: true, step: 'otp', email: 'a@b.co' }} />)
    expect((b.container.querySelector('[data-sf-ppa-submit]') as HTMLButtonElement).value).toBe('otp-login')
  })

  it('shows errors as an alert, disables the button while pending and links to sign in', () => {
    const { container } = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={full} pending loginHref="/cuenta/entrar" data={{ ok: false, email: 'a@b.co', error: { code: 'rate_limited' } }} />)
    const alert = container.querySelector('[data-sf-ppa-error=rate_limited]')!
    expect(alert.getAttribute('role')).toBe('alert')
    expect((container.querySelector('[data-sf-ppa-submit]') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('[data-sf-ppa-login]')!.getAttribute('href')).toBe('/cuenta/entrar')
  })

  it('speaks English and accepts overrides', () => {
    expect(postPurchaseAccountPromptMessages('en-US').title).toBe('Create your account to follow your order')
    expect(postPurchaseAccountPromptMessages('es', { title: 'Hola', errors: { unavailable: 'x' } }).errors.rate_limited).toContain('Demasiados')
    const { container } = render(<PostPurchaseAccountPrompt email="a@b.co" capabilities={full} locale="en" headingLevel={3} />)
    expect(container.querySelector('h3')!.textContent).toContain('follow your order')
  })

  it('has no accessibility violations in any view', async () => {
    const views = [
      <PostPurchaseAccountPrompt key="a" email="a@b.co" capabilities={full} loginHref="/x" />,
      <PostPurchaseAccountPrompt key="b" email="a@b.co" capabilities={full} data={{ ok: true, step: 'verify', email: 'a@b.co' }} />,
      <PostPurchaseAccountPrompt key="c" email="a@b.co" capabilities={full} data={{ ok: false, error: { code: 'invalid_code', field: 'code' }, step: 'verify', email: 'a@b.co' }} />,
      <PostPurchaseAccountPrompt key="d" email="a@b.co" capabilities={otpOnly} />,
    ]
    for (const ui of views) {
      const r = render(ui)
      expect((await axe.run(r.container, AXE)).violations).toEqual([])
      r.unmount()
    }
  })
})
