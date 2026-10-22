// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FormModal } from './form-modal'
import { Modal } from './modal'
import { ResponsiveDialog, type ResponsiveDialogFooter } from './responsive-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
const realMatchMedia = window.matchMedia

function setViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  window.matchMedia = realMatchMedia
})

function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const footerActions = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot=dialog-footer] button[data-action]')).map(
    (b) => b.dataset.action,
  )

const footer = (run = vi.fn()): ResponsiveDialogFooter => ({
  primary: { key: 'confirm', label: 'Confirmar picking', run },
  secondary: [
    { key: 'print', label: 'Imprimir surtido', run: vi.fn() },
    { key: 'label', label: 'Imprimir etiqueta', run: vi.fn() },
  ],
  destructive: [{ key: 'release', label: 'Liberar apartado', run: vi.fn() }],
  extra: [{ key: 'history', label: 'Ver historial', run: vi.fn() }],
})

describe('ResponsiveDialog — desktop (≥ 768px)', () => {
  it('is a centered dialog with footer order [destructive] … [extra] [secondary] [PRIMARY]', () => {
    setViewport(true)
    mount(
      <ResponsiveDialog open onOpenChange={() => {}} title='Despacho SO-00004' footer={footer()}>
        cuerpo
      </ResponsiveDialog>,
    )
    const dialog = q('[role=dialog]')!
    expect(dialog.dataset.variant).toBe('dialog')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(q(`#${CSS.escape(dialog.getAttribute('aria-labelledby')!)}`)?.textContent).toBe('Despacho SO-00004')
    expect(footerActions()).toEqual(['release', 'history', 'print', 'label', 'confirm'])
    const primaries = document.querySelectorAll('[data-slot=dialog-footer] [data-variant=default]')
    expect(primaries).toHaveLength(1)
    expect(q('[data-action=release]')!.className).toContain('text-destructive')
    expect(q('[data-slot=responsive-dialog-handle]')).toBeNull()
    // Close button: labelled, 44px.
    const close = q('[data-slot=dialog-close]')!
    expect(close.getAttribute('aria-label')).toBe('Cerrar')
    expect(close.className).toContain('size-11')
  })

  it('confirms destructive actions before running them', async () => {
    setViewport(true)
    const release = vi.fn()
    mount(
      <ResponsiveDialog
        open
        onOpenChange={() => {}}
        title='T'
        footer={{ destructive: [{ key: 'release', label: 'Liberar apartado', run: release, confirm: { title: '¿Liberar el apartado?' } }] }}
      />,
    )
    act(() => q<HTMLButtonElement>('[data-action=release]')!.click())
    expect(release).not.toHaveBeenCalled()
    const alert = q('[role=alertdialog]')!
    expect(alert.textContent).toContain('¿Liberar el apartado?')
    const ok = Array.from(alert.querySelectorAll('button')).find((b) => b.textContent === 'Liberar apartado')!
    await act(async () => ok.click())
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner on the pending primary and locks the other actions', async () => {
    setViewport(true)
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    mount(
      <ResponsiveDialog open onOpenChange={() => {}} title='T' footer={footer(run)}>
        x
      </ResponsiveDialog>,
    )
    const primary = q<HTMLButtonElement>('[data-action=confirm]')!
    await act(async () => primary.click())
    expect(primary.getAttribute('aria-busy')).toBe('true')
    expect(primary.disabled).toBe(true)
    expect(q<HTMLButtonElement>('[data-action=print]')!.disabled).toBe(true)
    await act(async () => resolve())
    expect(primary.hasAttribute('aria-busy')).toBe(false)
  })

  it('respects dismissable=false on Escape', () => {
    setViewport(true)
    const onOpenChange = vi.fn()
    mount(<ResponsiveDialog open onOpenChange={onOpenChange} title='T' dismissable={false} />)
    act(() => {
      q('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(q('[data-slot=dialog-close]')).toBeNull()
  })

  it('closes on Escape when dismissable', () => {
    setViewport(true)
    const onOpenChange = vi.fn()
    mount(<ResponsiveDialog open onOpenChange={onOpenChange} title='T' />)
    act(() => {
      q('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('ResponsiveDialog — phone (< 768px)', () => {
  it('is a bottom sheet: handle, scrolling body, sticky footer with safe-area', () => {
    setViewport(false)
    mount(
      <ResponsiveDialog open onOpenChange={() => {}} title='Despacho' header={<div>stepper</div>} footer={footer()}>
        cuerpo
      </ResponsiveDialog>,
    )
    const dialog = q('[role=dialog]')!
    expect(dialog.dataset.variant).toBe('sheet')
    expect(dialog.className).toContain('max-h-[92dvh]')
    expect(dialog.className).toContain('bottom-0')
    expect(q('[data-slot=responsive-dialog-handle]')).not.toBeNull()
    expect(q('[data-slot=responsive-dialog-body]')!.className).toContain('overflow-y-auto')
    expect(q('[data-slot=dialog-footer]')!.className).toContain('safe-area-inset-bottom')
    // Primary first and full width, then one secondary + «⋯»; the rest is in the menu.
    expect(footerActions()).toEqual(['confirm', 'print'])
    expect(q('[data-action=confirm]')!.className).toContain('w-full')
    expect(q('[data-slot=responsive-dialog-more]')!.getAttribute('aria-label')).toBe('Más opciones')
    expect(q('[data-action=release]')).toBeNull()
  })

  it('shows leftovers full width when there is nothing to anchor «⋯» to', () => {
    setViewport(false)
    mount(
      <ResponsiveDialog
        open
        onOpenChange={() => {}}
        title='T'
        footer={{ destructive: [{ key: 'del', label: 'Eliminar', run: vi.fn() }] }}
      />,
    )
    expect(footerActions()).toEqual(['del'])
    expect(q('[data-action=del]')!.className).toContain('w-full')
    expect(q('[data-slot=responsive-dialog-more]')).toBeNull()
  })

  it('supports fullscreen and dialog on phones', () => {
    setViewport(false)
    mount(<ResponsiveDialog open onOpenChange={() => {}} title='T' mobile='fullscreen' />)
    expect(q('[role=dialog]')!.dataset.variant).toBe('fullscreen')
    expect(q('[role=dialog]')!.className).toContain('h-dvh')
  })
})

describe('Modal / FormModal on top of ResponsiveDialog', () => {
  it('Modal keeps rendering a custom footer node in the sticky footer', () => {
    setViewport(true)
    mount(
      <Modal open onOpenChange={() => {}} title='Edit' footer={<button data-testid='legacy'>Save</button>}>
        body
      </Modal>,
    )
    expect(q('[data-slot=dialog-footer] [data-testid=legacy]')).not.toBeNull()
    expect(q('[data-slot=dialog-title]')!.textContent).toBe('Edit')
  })

  it('FormModal wires submit to the form, busy state and cancel', () => {
    setViewport(true)
    const onOpenChange = vi.fn()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    mount(
      <FormModal open onOpenChange={onOpenChange} title='Nuevo cliente' onSubmit={onSubmit} submitText='Guardar' cancelText='Cancelar'>
        <input name='n' />
      </FormModal>,
    )
    const submit = q<HTMLButtonElement>('[data-action=submit]')!
    const form = q<HTMLFormElement>('form')!
    expect(submit.type).toBe('submit')
    expect(submit.getAttribute('form')).toBe(form.id)
    expect(submit.textContent).toBe('Guardar')
    expect(footerActions()).toEqual(['cancel', 'submit'])
    act(() => q<HTMLButtonElement>('[data-action=cancel]')!.click())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('FormModal shows the submitting state and passes host footerExtra', () => {
    setViewport(true)
    mount(
      <FormModal
        open
        onOpenChange={() => {}}
        title='T'
        onSubmit={() => {}}
        isSubmitting
        footerExtra={[{ key: 'history', label: 'Ver historial', run: () => {} }]}
      />,
    )
    const submit = q<HTMLButtonElement>('[data-action=submit]')!
    expect(submit.disabled).toBe(true)
    expect(submit.getAttribute('aria-busy')).toBe('true')
    expect(footerActions()).toEqual(['history', 'cancel', 'submit'])
  })
})
