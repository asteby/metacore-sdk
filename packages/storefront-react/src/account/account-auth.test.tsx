// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import type { CustomerCapabilities } from '@asteby/storefront'
import { AccountAuth, accountAuthMessages } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const full: CustomerCapabilities = { password: true, email_verification: true, otp_channels: ['email'] }
const safe: CustomerCapabilities = { password: true, email_verification: false, otp_channels: [] }

describe('<AccountAuth />', () => {
  it('starts on the password sign-in with the right autofill tokens and a hidden next', () => {
    const { container } = render(<AccountAuth capabilities={full} next="/orders" />)
    expect(screen.getByRole('heading', { name: 'Entrar a tu cuenta' })).toBeTruthy()
    expect(container.querySelector('[name=email]')!.getAttribute('autocomplete')).toBe('email')
    expect(container.querySelector('[name=password]')!.getAttribute('autocomplete')).toBe('current-password')
    expect((container.querySelector('[name=next]') as HTMLInputElement).value).toBe('/orders')
    const submit = container.querySelector('[data-sf-account-submit]') as HTMLButtonElement
    expect(submit.name).toBe('intent')
    expect(submit.value).toBe('login')
    expect(container.querySelector('form')!.getAttribute('method')).toBe('post')
  })

  it('shows only what the store offers', () => {
    const a = render(<AccountAuth capabilities={safe} />)
    expect(a.container.querySelector('[data-sf-account-link=forgot]')).toBeNull()
    expect(a.container.querySelector('[data-sf-account-link=otp-email]')).toBeNull()
    expect(a.container.querySelector('[data-sf-account-link=register]')).toBeTruthy()
    a.unmount()
    const b = render(<AccountAuth capabilities={{ password: false, email_verification: false, otp_channels: ['email'] }} />)
    expect(b.container.querySelector('[data-sf-account-view]')!.getAttribute('data-sf-account-view')).toBe('otp-email')
    b.unmount()
    const c = render(<AccountAuth capabilities={{ password: false, email_verification: false, otp_channels: [] }} />)
    expect(c.container.textContent).toContain('no admite iniciar sesión')
  })

  it('switches between register, forgot and code sign-in with the right intent', () => {
    const { container } = render(<AccountAuth capabilities={full} />)
    const intent = () => (container.querySelector('[data-sf-account-submit]') as HTMLButtonElement).value
    fireEvent.click(container.querySelector('[data-sf-account-link=register]')!)
    expect(intent()).toBe('register')
    expect(container.querySelector('[name=password]')!.getAttribute('autocomplete')).toBe('new-password')
    expect(container.querySelector('[name=first_name]')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-sf-account-link=login]')!)
    fireEvent.click(container.querySelector('[data-sf-account-link=forgot]')!)
    expect(intent()).toBe('forgot')
    expect(container.querySelector('[name=password]')).toBeNull()
    fireEvent.click(container.querySelector('[data-sf-account-link=login]')!)
    fireEvent.click(container.querySelector('[data-sf-account-link=otp-email]')!)
    expect(intent()).toBe('otp-request')
  })

  it('moves to the step the action says and carries the email', () => {
    const { container, rerender } = render(<AccountAuth capabilities={full} />)
    rerender(<AccountAuth capabilities={full} data={{ ok: true, step: 'verify', email: 'a@b.co' }} />)
    expect(screen.getByRole('heading', { name: 'Confirma tu correo' })).toBeTruthy()
    expect((container.querySelector('input[type=hidden][name=email]') as HTMLInputElement).value).toBe('a@b.co')
    expect(container.querySelector('[name=code]')!.getAttribute('autocomplete')).toBe('one-time-code')
    expect(container.textContent).toContain('a@b.co')
    rerender(<AccountAuth capabilities={full} data={{ ok: true, step: 'otp', email: 'a@b.co' }} />)
    expect((container.querySelector('[data-sf-account-submit]') as HTMLButtonElement).value).toBe('otp-login')
    expect((container.querySelector('[data-sf-account-link=resend]') as HTMLButtonElement).value).toBe('otp-request')
    rerender(<AccountAuth capabilities={full} data={{ ok: true, step: 'reset', email: 'a@b.co' }} />)
    expect((container.querySelector('[data-sf-account-submit]') as HTMLButtonElement).value).toBe('reset')
    expect(container.querySelector('[name=password]')).toBeTruthy()
    expect(container.querySelector('[name=code]')).toBeTruthy()
  })

  it('writes the action errors in Spanish or English, next to the field when there is one', () => {
    const { container, rerender } = render(<AccountAuth capabilities={full} data={{ ok: false, email: 'a@b.co', error: { code: 'invalid_credentials' } }} />)
    expect(screen.getByRole('alert').textContent).toBe('El correo o la contraseña no coinciden.')
    rerender(<AccountAuth capabilities={full} locale="en" data={{ ok: false, error: { code: 'rate_limited' } }} />)
    expect(screen.getByRole('alert').textContent).toContain('Too many attempts')
    rerender(<AccountAuth capabilities={full} initialView="register" data={{ ok: false, error: { code: 'email_taken', field: 'email' } }} locale="es" />)
    expect(container.querySelector('#email-error')!.textContent).toContain('Ya existe una cuenta')
    expect(container.querySelector('[name=email]')!.getAttribute('aria-invalid')).toBe('true')
  })

  it('accepts message overrides, a custom form component and pending', () => {
    let used = false
    const MyForm = (props: React.FormHTMLAttributes<HTMLFormElement> & { ref?: React.Ref<HTMLFormElement> }) => {
      used = true
      return <form {...props} data-mine="" />
    }
    const { container } = render(<AccountAuth capabilities={full} form={MyForm} pending messages={{ titles: { login: 'Hola' }, submit: { login: 'Pasar' } }} />)
    expect(used).toBe(true)
    expect(container.querySelector('[data-mine]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Hola' })).toBeTruthy()
    const b = container.querySelector('[data-sf-account-submit]') as HTMLButtonElement
    expect(b.textContent).toBe('Pasar')
    expect(b.disabled).toBe(true)
    expect(accountAuthMessages('en').submit.login).toBe('Sign in')
  })

  it('renders on the server without touching window', () => {
    const html = renderToString(<AccountAuth capabilities={full} />)
    expect(html).toContain('data-sf-account-auth')
    expect(html).toContain('name="intent"')
  })

  it('has no axe violations in its views', async () => {
    const { container } = render(<AccountAuth capabilities={full} data={{ ok: false, error: { code: 'invalid_credentials' } }} />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
    fireEvent.click(container.querySelector('[data-sf-account-link=register]')!)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})
