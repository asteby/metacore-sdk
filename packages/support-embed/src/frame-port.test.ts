// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createParentPort } from './frame-port'

const PARENT = 'https://tienda.example'

function fakeWin(ancestor?: string) {
  const parent = { postMessage: vi.fn() }
  const target = new EventTarget()
  const win = {
    parent,
    location: { ancestorOrigins: ancestor ? [ancestor] : undefined },
    addEventListener: (t: string, h: EventListener) => target.addEventListener(t, h),
    removeEventListener: (t: string, h: EventListener) => target.removeEventListener(t, h),
  } as unknown as Window & { location: Location }
  const send = (data: unknown, origin: string, source: unknown = parent) => {
    const e = new Event('message') as Event & Record<string, unknown>
    Object.assign(e, { data, origin, source })
    target.dispatchEvent(e)
  }
  return { win, parent, send }
}

const hello = { mcs: 1, t: 'hello' }

describe('createParentPort', () => {
  it('toma el origen del primer hello del padre y envia solo a ese origen', async () => {
    const { win, parent, send } = fakeWin()
    const port = createParentPort(win)
    port.send({ t: 'ready' })
    expect(parent.postMessage).not.toHaveBeenCalled() // origen aun desconocido
    send(hello, PARENT)
    await expect(port.origin).resolves.toBe(PARENT)
    port.send({ t: 'ready' })
    expect(parent.postMessage).toHaveBeenCalledWith({ mcs: 1, t: 'ready' }, PARENT)
    expect(parent.postMessage.mock.calls.every((c) => c[1] !== '*')).toBe(true)
  })

  it('rechaza el primer mensaje si no es hello, no viene del padre o el origen es opaco', () => {
    const { win, send } = fakeWin()
    const port = createParentPort(win)
    send({ mcs: 1, t: 'open' }, PARENT)
    send(hello, PARENT, {}) // otra ventana
    send(hello, 'null')
    send({ t: 'hello' }, PARENT) // sin sobre
    expect(port.currentOrigin()).toBeUndefined()
  })

  it('una vez fijado, ignora mensajes de otro origen', () => {
    const { win, send } = fakeWin()
    const port = createParentPort(win)
    const got = vi.fn()
    port.on(got)
    send(hello, PARENT)
    send({ mcs: 1, t: 'open' }, 'https://evil.example')
    send({ mcs: 1, t: 'identify', token: 'a.b.c' }, 'https://evil.example')
    expect(got.mock.calls.map((c) => c[0].t)).toEqual(['hello'])
    send({ mcs: 1, t: 'open' }, PARENT)
    expect(got.mock.calls.map((c) => c[0].t)).toEqual(['hello', 'open'])
  })

  it('con ancestorOrigins exige coincidencia con el origen del mensaje', () => {
    const { win, send } = fakeWin('https://otro.example')
    const port = createParentPort(win)
    send(hello, PARENT)
    expect(port.currentOrigin()).toBeUndefined()
    const ok = fakeWin(PARENT)
    const p2 = createParentPort(ok.win)
    ok.send(hello, PARENT)
    expect(p2.currentOrigin()).toBe(PARENT)
  })
})
