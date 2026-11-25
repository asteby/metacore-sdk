// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootFrame, localVisitorStore } from './frame-boot'

const PARENT = 'https://tienda.example'

function fakeWin(search: string) {
  const parent = { postMessage: vi.fn() }
  const target = new EventTarget()
  const win = {
    parent,
    location: { search },
    navigator: { language: 'es-MX' },
    localStorage: window.localStorage,
    addEventListener: (t: string, h: EventListener) => target.addEventListener(t, h),
    removeEventListener: (t: string, h: EventListener) => target.removeEventListener(t, h),
  } as unknown as Window
  const hello = () => {
    const e = new Event('message') as Event & Record<string, unknown>
    Object.assign(e, { data: { mcs: 1, t: 'hello' }, origin: PARENT, source: parent })
    target.dispatchEvent(e)
  }
  return { win, parent, hello }
}

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('bootFrame', () => {
  it('sin la configuracion inyectada por el Hub avisa unavailable (nada esta fijado en el paquete)', async () => {
    const { win, parent, hello } = fakeWin('?channel=sch_ABCDEFGH1234')
    const container = document.body.appendChild(document.createElement('div'))
    const boot = bootFrame(win, document, container)
    hello()
    await vi.waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ mcs: 1, t: 'unavailable' }, PARENT))
    expect(boot.root).toBeNull()
    boot.dispose()
  })

  it('no hace nada hasta recibir el hello del padre', async () => {
    const { win, parent } = fakeWin('?channel=sch_ABCDEFGH1234')
    const boot = bootFrame(win, document, document.body.appendChild(document.createElement('div')))
    await Promise.resolve()
    expect(parent.postMessage).not.toHaveBeenCalled()
    boot.dispose()
  })
})

describe('localVisitorStore', () => {
  it('guarda por canal y tolera un almacenamiento que lanza', () => {
    const s = localVisitorStore(window, 'sch_X')
    s.set('sup_vt_1')
    expect(s.get()).toBe('sup_vt_1')
    s.clear()
    expect(s.get()).toBeNull()
    const broken = { get localStorage(): Storage { throw new Error('blocked') } } as unknown as Window
    const b = localVisitorStore(broken, 'sch_X')
    expect(() => b.set('x')).not.toThrow()
    expect(b.get()).toBeNull()
    expect(() => b.clear()).not.toThrow()
  })
})
