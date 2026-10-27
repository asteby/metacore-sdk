// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { useState } from 'react'
import { PendingButton } from './pending-button'
import { useActionLock, useSubmitOnce } from './use-action-lock'
import { pendingMessages } from './pending-messages'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}

function Download({ work, cooldownMs = 600 }: { work: (signal: AbortSignal) => Promise<unknown>; cooldownMs?: number }) {
  const lock = useActionLock({ cooldownMs })
  return (
    <div>
      <PendingButton pending={lock.pending} kind="download" result={lock.result} cooldownMs={cooldownMs} onClick={() => void lock.run(work)}>
        Descargar PDF
      </PendingButton>
      <button type="button" onClick={lock.abort}>
        cancelar
      </button>
    </div>
  )
}

describe('PendingButton + useActionLock', () => {
  it('a double click runs the work once; while it runs the button is disabled, busy, announces and keeps its width', async () => {
    const d = deferred<{ ok: true }>()
    const work = vi.fn(() => d.promise)
    const user = userEvent.setup()
    render(<Download work={work} />)
    const btn = screen.getByRole('button', { name: 'Descargar PDF' })
    await user.dblClick(btn)
    await user.click(btn)
    expect(work).toHaveBeenCalledTimes(1)
    const busy = screen.getByRole('button', { name: /Descargando/ })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(busy.hasAttribute('data-sf-pending')).toBe(true)
    expect(busy.querySelector('svg.sf-spinner')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Descargando…')
    expect((await axe.run(document.body, AXE)).violations).toEqual([])
    await act(async () => d.resolve({ ok: true }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Listo.'))
  })

  it('ignores clicks during the 600 ms cooldown after the work ends, then accepts one again', async () => {
    const work = vi.fn(async () => ({ ok: true }))
    const user = userEvent.setup()
    render(<Download work={work} />)
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    await waitFor(() => expect(work).toHaveBeenCalledTimes(1))
    const btn = screen.getByRole('button', { name: 'Descargar PDF' })
    await waitFor(() => expect(btn.getAttribute('aria-disabled')).toBe('true')) // cooling down
    await user.click(btn)
    expect(work).toHaveBeenCalledTimes(1)
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false), { timeout: 2000 })
    await user.click(btn)
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('aborts the request on cancel / unmount and announces nothing as failure', async () => {
    let signal!: AbortSignal
    const work = vi.fn((s: AbortSignal) => {
      signal = s
      return new Promise((_r, rej) => s.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))
    })
    const user = userEvent.setup()
    const { unmount } = render(<Download work={work} />)
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    await user.click(screen.getByRole('button', { name: 'cancelar' }))
    expect(signal.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByText('No se pudo completar. Inténtalo de nuevo.')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar PDF' }).getAttribute('aria-busy')).toBeNull(), { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('announces a failed run and returns the focus to the button', async () => {
    const work = vi.fn(async () => {
      throw new Error('boom')
    })
    const user = userEvent.setup()
    render(<Download work={work} cooldownMs={0} />)
    const btn = screen.getByRole('button', { name: 'Descargar PDF' })
    await user.click(btn)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No se pudo completar'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Descargar PDF' }))
  })

  it('English texts and overrides; a link keeps its href and is aria-disabled, never a dead anchor', () => {
    expect(pendingMessages('en-US')['pending.invoice']).toBe('Generating invoice…')
    expect(pendingMessages('es', { 'pending.pay': 'Cobrando…' })['pending.pay']).toBe('Cobrando…')
    render(
      <PendingButton href="/x.pdf" pending kind="download" locale="en">
        Download
      </PendingButton>,
    )
    const a = screen.getByRole('link', { name: /Downloading/ })
    expect(a.getAttribute('href')).toBe('/x.pdf')
    expect(a.getAttribute('aria-disabled')).toBe('true')
  })

  it('a submit button inside a form still submits (it is never disabled by its own click)', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={onSubmit}>
        <PendingButton type="submit" kind="send">
          Enviar
        </PendingButton>
      </form>,
    )
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('with several submit buttons only the clicked one shows the spinner (shared), all are locked', async () => {
    function Two() {
      const [p, setP] = useState(false)
      return (
        <form onSubmit={(e) => (e.preventDefault(), setP(true))}>
          <PendingButton type="submit" pending={p} shared kind="save">
            Guardar
          </PendingButton>
          <PendingButton type="submit" pending={p} shared kind="send">
            Reenviar
          </PendingButton>
        </form>
      )
    }
    const user = userEvent.setup()
    render(<Two />)
    await user.click(screen.getByRole('button', { name: 'Reenviar' }))
    expect(screen.getByRole('button', { name: /Enviando/ }).getAttribute('aria-busy')).toBe('true')
    const other = screen.getByRole('button', { name: 'Guardar' })
    expect((other as HTMLButtonElement).disabled).toBe(true)
    expect(other.getAttribute('aria-busy')).toBeNull()
  })
})

describe('useSubmitOnce', () => {
  it('refuses a second submit before the router reports the first, and for the cooldown after it', async () => {
    vi.useFakeTimers()
    const submitted = vi.fn()
    function F({ pending }: { pending: boolean }) {
      const { guard, locked } = useSubmitOnce(pending, { cooldownMs: 600 })
      return (
        <form onSubmit={(e) => (guard(e) ? (e.preventDefault(), submitted()) : undefined)} data-locked={locked}>
          <button type="submit">go</button>
        </form>
      )
    }
    const { rerender, container } = render(<F pending={false} />)
    const form = container.querySelector('form')!
    const submit = () => act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    submit()
    submit() // double click inside the gap
    expect(submitted).toHaveBeenCalledTimes(1)
    rerender(<F pending />)
    act(() => void vi.advanceTimersByTime(1000))
    submit()
    expect(submitted).toHaveBeenCalledTimes(1) // still pending
    rerender(<F pending={false} />)
    submit()
    expect(submitted).toHaveBeenCalledTimes(1) // cooldown
    act(() => void vi.advanceTimersByTime(700))
    submit()
    expect(submitted).toHaveBeenCalledTimes(2)
  })
})
