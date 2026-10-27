// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import type { CustomerCapabilities } from '@asteby/storefront'
import { AccountAuth, accountAuthMessages, type AccountFormProps } from './index.js'

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

  it('shows the store-misconfigured message, with no password form, and passes axe', async () => {
    const miss: CustomerCapabilities = { password: false, email_verification: false, otp_channels: [], unavailable_reason: 'missing_scope', missing_scopes: ['customer:write'] }
    const a = render(<AccountAuth capabilities={miss} />)
    expect(a.container.textContent).toContain('problema de configuración de la tienda')
    expect(a.container.textContent).toContain('Puedes comprar como invitado')
    expect(a.container.querySelector('[name=password]')).toBeNull()
    expect((await axe.run(a.container, AXE)).violations).toEqual([])
    a.unmount()
    const b = render(<AccountAuth capabilities={full} data={{ ok: false, email: 'a@b.co', error: { code: 'store_misconfigured' } }} />)
    const alert = b.container.querySelector('[data-sf-account-error=store_misconfigured]')!
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('ya avisamos a la tienda')
    expect((await axe.run(b.container, AXE)).violations).toEqual([])
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
    const MyForm = (props: AccountFormProps) => {
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

  describe('code step of a registration', () => {
    const registered = () => {
      const view = render(<AccountAuth capabilities={full} initialView="register" />)
      const { container } = view
      fireEvent.change(container.querySelector('[name=first_name]')!, { target: { value: 'Ana' } })
      fireEvent.change(container.querySelector('[name=email]')!, { target: { value: 'ana@b.co' } })
      fireEvent.change(container.querySelector('[name=password]')!, { target: { value: 'una-clave-larga' } })
      fireEvent.submit(container.querySelector('form')!)
      view.rerender(<AccountAuth capabilities={full} initialView="register" data={{ ok: true, step: 'verify', email: 'ana@b.co' }} />)
      return view
    }

    it('offers a resend with a cooldown that repeats the registration, without leaking the password into the code form', () => {
      vi.useFakeTimers()
      try {
        const { container } = registered()
        expect(screen.getByRole('heading', { name: 'Confirma tu correo' })).toBeTruthy()
        const code = container.querySelector('[data-sf-account-form]') as HTMLFormElement
        expect(code.querySelector('[name=password]')).toBeNull()
        const resendForm = container.querySelector('[data-sf-account-resend-form]') as HTMLFormElement
        expect((resendForm.querySelector('[name=password]') as HTMLInputElement).value).toBe('una-clave-larga')
        expect((resendForm.querySelector('[name=email]') as HTMLInputElement).value).toBe('ana@b.co')
        expect((resendForm.querySelector('[name=first_name]') as HTMLInputElement).value).toBe('Ana')
        const btn = resendForm.querySelector('button') as HTMLButtonElement
        expect([btn.name, btn.value]).toEqual(['intent', 'resend'])
        // Cooling down: disabled and counting.
        expect(btn.disabled).toBe(true)
        expect(btn.textContent).toBe('Reenviar código (60 s)')
        act(() => void vi.advanceTimersByTime(30_000))
        expect(btn.textContent).toBe('Reenviar código (30 s)')
        act(() => void vi.advanceTimersByTime(30_000))
        expect(btn.disabled).toBe(false)
        expect(btn.textContent).toBe('Reenviar código')
      } finally {
        vi.useRealTimers()
      }
    })

    it('says a new code was sent after a resend, restarts the cooldown and follows a server wait', () => {
      vi.useFakeTimers()
      try {
        const { container, rerender } = registered()
        act(() => void vi.advanceTimersByTime(61_000))
        rerender(<AccountAuth capabilities={full} initialView="register" data={{ ok: true, step: 'verify', email: 'ana@b.co', resent: true }} />)
        expect(container.querySelector('[data-sf-account-notice]')!.textContent).toContain('código nuevo')
        const btn = container.querySelector('[data-sf-account-resend-form] button') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        act(() => void vi.advanceTimersByTime(61_000))
        rerender(<AccountAuth capabilities={full} initialView="register" data={{ ok: false, step: 'verify', email: 'ana@b.co', error: { code: 'rate_limited', retryAfter: 17 } }} />)
        expect(btn.textContent).toBe('Reenviar código (17 s)')
        expect(screen.getByRole('alert').textContent).toContain('Demasiados intentos')
      } finally {
        vi.useRealTimers()
      }
    })

    it('without the held password (page reloaded) there is no resend form, only a way back to correct the email', () => {
      const { container } = render(<AccountAuth capabilities={full} data={{ ok: true, step: 'verify', email: 'ana@b.co' }} />)
      expect(container.querySelector('[data-sf-account-resend-form]')).toBeNull()
      fireEvent.click(container.querySelector('[data-sf-account-link=register]')!)
      expect(screen.getByRole('heading', { name: 'Crear una cuenta' })).toBeTruthy()
      expect((container.querySelector('[name=email]') as HTMLInputElement).value).toBe('ana@b.co')
    })

    it('explains a wrong or expired code on the field and has no axe violations', async () => {
      const { container, rerender } = registered()
      rerender(<AccountAuth capabilities={full} initialView="register" data={{ ok: false, step: 'verify', email: 'ana@b.co', error: { code: 'invalid_code', field: 'code' } }} />)
      expect(container.querySelector('#code-error')!.textContent).toContain('ya venció')
      expect(container.querySelector('#code-error')!.textContent).toContain('pide uno nuevo')
      expect((await axe.run(container, AXE)).violations).toEqual([])
    })

    it('the sign-in code resend also cools down', () => {
      vi.useFakeTimers()
      try {
        const { container } = render(<AccountAuth capabilities={full} data={{ ok: true, step: 'otp', email: 'a@b.co' }} />)
        const btn = container.querySelector('[data-sf-account-link=resend]') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        act(() => void vi.advanceTimersByTime(60_000))
        expect(btn.disabled).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

/** The store's checkout panel: «Inicia sesión» / «Crea tu cuenta» tabs that remount the form while `data` (the last action result) stays the same object. */
function Tabs({ data }: { data: Parameters<typeof AccountAuth>[0]['data'] }) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [attempt, setAttempt] = useState(0)
  const pick = (m: 'login' | 'register') => {
    setMode(m)
    setAttempt((n) => n + 1)
  }
  return (
    <div>
      <button type="button" onClick={() => pick('login')}>
        Inicia sesión
      </button>
      <button type="button" onClick={() => pick('register')}>
        Crea tu cuenta
      </button>
      <AccountAuth key={`${mode}-${attempt}`} capabilities={full} data={data} initialView={mode} />
    </div>
  )
}

describe('<AccountAuth /> leaving the pending verification', () => {
  // A fresh object per use: each action result is a new object (the component remembers the ones the buyer left).
  const sent = () => ({ ok: true, email: 'dup@b.co', step: 'verify' as const })
  const view = (c: HTMLElement) => c.querySelector('[data-sf-account-view]')!.getAttribute('data-sf-account-view')

  for (const [name, leave] of [
    ['Usar otro correo', 'register'],
    ['Volver a entrar con contraseña', 'login'],
  ] as const) {
    it(`"${name}" then the «Inicia sesión» tab shows the sign-in form, not the code step`, () => {
      const { container, rerender } = render(<Tabs data={null} />)
      rerender(<Tabs data={sent()} />)
      expect(view(container)).toBe('verify')
      fireEvent.click(container.querySelector(`[data-sf-account-link=${leave}]`)!)
      expect(view(container)).toBe(leave)
      fireEvent.click(screen.getByRole('button', { name: 'Inicia sesión' }))
      expect(view(container)).toBe('login')
      expect(container.querySelector('[name=code]')).toBeNull()
      expect(container.querySelector('[name=password]')).toBeTruthy()
      expect((container.querySelector('[data-sf-account-submit]') as HTMLButtonElement).value).toBe('login')
      // And back to «Crea tu cuenta»: the registration form, still not the code step.
      fireEvent.click(screen.getByRole('button', { name: 'Crea tu cuenta' }))
      expect(view(container)).toBe('register')
    })
  }

  it('drops the password held for the resend as soon as the code step is left', () => {
    const { container, rerender } = render(<AccountAuth capabilities={full} initialView="register" />)
    const form = container.querySelector('[data-sf-account-form]') as HTMLFormElement
    fireEvent.change(container.querySelector('[name=email]')!, { target: { value: 'dup@b.co' } })
    fireEvent.change(container.querySelector('[name=password]')!, { target: { value: 'secret-password-1' } })
    fireEvent.submit(form)
    rerender(<AccountAuth capabilities={full} initialView="register" data={sent()} />)
    expect(container.querySelector('[data-sf-account-resend-form] [name=password]')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-sf-account-link=register]')!)
    expect(container.querySelector('[data-sf-account-resend-form]')).toBeNull()
    expect(container.innerHTML).not.toContain('secret-password-1')
    fireEvent.click(container.querySelector('[data-sf-account-link=login]')!)
    expect(view(container)).toBe('login')
    expect(container.querySelector('[data-sf-account-resend-form]')).toBeNull()
    expect(container.innerHTML).not.toContain('secret-password-1')
  })

  it('does not show the error of a dismissed result on the next screen', () => {
    const { container, rerender } = render(<AccountAuth capabilities={full} initialView="login" />)
    rerender(<AccountAuth capabilities={full} initialView="login" data={{ ok: false, email: 'a@b.co', error: { code: 'invalid_credentials' } }} />)
    expect(container.querySelector('[data-sf-account-error]')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-sf-account-link=register]')!)
    expect(container.querySelector('[data-sf-account-error]')).toBeNull()
  })
})
