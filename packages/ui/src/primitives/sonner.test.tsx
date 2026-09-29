// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { Toaster } from './sonner'
import { TOAST_CLOSE_CSS } from './toast-close'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CLOSE = '[data-sonner-toast] > [data-slot="toast-close"]'

let host: HTMLElement
let root: Root

async function flush(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function mount(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui)
  })
  await flush()
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => {
    toast.dismiss()
  })
  await flush(400)
  await act(async () => root.unmount())
  host.remove()
})

describe('Toaster close button', () => {
  it('adds a labelled close button to every kind of toast', async () => {
    await mount(<Toaster closeButtonLabel='Cerrar notificación' />)
    await act(async () => {
      toast('Plain')
      toast.success('Saved')
      toast.error('Failed')
      toast.info('Heads up')
      toast.warning('Careful')
      toast.loading('Working…')
      toast('With action', { action: { label: 'Undo', onClick: () => {} } })
      toast.custom(() => <div>Catálogo de addons actualizado</div>)
    })
    await flush()

    const toasts = host.querySelectorAll('[data-sonner-toast]')
    const buttons = host.querySelectorAll<HTMLButtonElement>(CLOSE)
    expect(toasts.length).toBe(8)
    expect(buttons.length).toBe(8)
    buttons.forEach((b) => {
      expect(b.tagName).toBe('BUTTON')
      expect(b.type).toBe('button')
      expect(b.getAttribute('aria-label')).toBe('Cerrar notificación')
    })
  })

  it('falls back to a localized label from the document language', async () => {
    document.documentElement.lang = 'en'
    await mount(<Toaster />)
    await act(async () => {
      toast('Hello')
    })
    await flush()
    expect(host.querySelector(CLOSE)?.getAttribute('aria-label')).toBe('Dismiss notification')
    document.documentElement.lang = ''
  })

  it('dismisses the toast it belongs to', async () => {
    await mount(<Toaster />)
    await act(async () => {
      toast('First', { id: 'first' })
      toast('Second', { id: 'second' })
    })
    await flush()

    const second = Array.from(host.querySelectorAll<HTMLElement>('[data-sonner-toast]')).find(
      (li) => li.textContent?.includes('Second'),
    )!
    await act(async () => {
      second.querySelector<HTMLButtonElement>('[data-slot="toast-close"]')!.click()
    })
    await flush(400)

    const left = Array.from(host.querySelectorAll('[data-sonner-toast]')).map((li) => li.textContent)
    expect(left.some((txt) => txt?.includes('First'))).toBe(true)
    expect(left.some((txt) => txt?.includes('Second'))).toBe(false)
  })

  it('is keyboard focusable and revealed on focus', async () => {
    await mount(<Toaster expand />)
    await act(async () => {
      toast('Idle')
      toast('Focus me')
    })
    await flush()

    const [focused, idle] = Array.from(host.querySelectorAll<HTMLButtonElement>(CLOSE))
    focused.focus()
    expect(document.activeElement).toBe(focused)
    // Hidden until its toast is hovered or focused (happy-dom caches computed
    // styles per element, so compare two toasts instead of before/after).
    expect(getComputedStyle(idle).opacity).toBe('0')
    expect(getComputedStyle(focused).opacity).toBe('1')
    expect(TOAST_CLOSE_CSS).toMatch(/\[data-sonner-toast\]:hover > \[data-slot='toast-close'\]/)
  })

  it('can be turned off with closeButton={false}', async () => {
    await mount(<Toaster closeButton={false} />)
    await act(async () => {
      toast('No close')
    })
    await flush()
    expect(host.querySelector('[data-sonner-toast]')).not.toBeNull()
    expect(host.querySelector(CLOSE)).toBeNull()
  })

  it('skips toasts marked dismissible: false', async () => {
    await mount(<Toaster />)
    await act(async () => {
      toast('Sticky', { dismissible: false })
    })
    await flush()
    expect(host.querySelector('[data-sonner-toast]')).not.toBeNull()
    expect(host.querySelector(CLOSE)).toBeNull()
  })
})
