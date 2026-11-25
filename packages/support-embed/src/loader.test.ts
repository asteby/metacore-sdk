// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initLoader, installLoader, type LoaderApi } from './loader'
import { parseToFrame, parseToParent } from './protocol'

const HUB = 'https://hub.example'
const SRC = `${HUB}/embed/support/v1/loader.js`
const CH = 'sch_7K3M9Q2X8V4N1P6R5T0WABCDEF'

const script = (over: Record<string, string> = {}, src = SRC) => ({ src, dataset: { channel: CH, locale: 'es-MX', ...over } }) as never

function setup(over: Record<string, string> = {}, src = SRC) {
  const handle = initLoader({ doc: document, win: window, script: script(over, src) })
  const frame = document.querySelector('iframe') as HTMLIFrameElement | null
  const posted: Array<{ msg: unknown; target: string }> = []
  const fake = { postMessage: (msg: unknown, target: string) => posted.push({ msg, target }) } as unknown as Window
  if (frame) Object.defineProperty(frame, 'contentWindow', { value: fake, configurable: true })
  const fromFrame = (data: unknown, origin = HUB, source: unknown = fake) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }))
  const button = () => document.querySelector('button') as HTMLButtonElement | null
  return { handle, frame, posted, fake, fromFrame, button }
}

const profile = { mcs: 1, t: 'profile', position: 'bottom-left', launcher: 'Te ayudamos?', brand_color: '#0E7490', on_brand: '#ffffff' }

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('loader', () => {
  it('crea el iframe del canal a partir del src del script, sin tocar innerHTML', () => {
    const { handle, frame } = setup()
    expect(handle).not.toBeNull()
    const u = new URL(frame!.src)
    expect(u.origin + u.pathname).toBe(`${HUB}/embed/support/v1/frame`)
    expect(u.searchParams.get('channel')).toBe(CH)
    expect(u.searchParams.get('locale')).toBe('es-MX')
    expect(frame!.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame!.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('no hace nada con un id de canal invalido o un src no https', () => {
    expect(setup({ channel: 'x"><script>' }).handle).toBeNull()
    expect(setup({}, 'http://hub.example/v1/loader.js').handle).toBeNull()
    expect(setup({}, 'javascript:alert(1)').handle).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(setup({}, 'http://localhost:8080/v1/loader.js').handle).not.toBeNull()
  })

  it('envia hello solo al origen del Hub (nunca "*") y reintenta hasta recibir ready', () => {
    vi.useFakeTimers()
    const { frame, posted, fromFrame } = setup()
    frame!.dispatchEvent(new Event('load'))
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ target: HUB, msg: { mcs: 1, t: 'hello', locale: 'es-MX' } })
    vi.advanceTimersByTime(260)
    expect(posted).toHaveLength(2)
    fromFrame({ mcs: 1, t: 'ready' })
    vi.advanceTimersByTime(2000)
    expect(posted).toHaveLength(2)
    expect(posted.every((p) => p.target === HUB)).toBe(true)
  })

  it('ignora mensajes de origen ajeno, de otra ventana o malformados', () => {
    const { fromFrame, button } = setup()
    fromFrame(profile, 'https://evil.example')
    fromFrame(profile, HUB, window)
    fromFrame({ ...profile, brand_color: 'red; background:url(x)' })
    fromFrame({ ...profile, position: 'top' })
    fromFrame('profile')
    expect(button()!.style.display).toBe('none')
    expect(button()!.textContent).toBe('')
  })

  it('aplica el perfil validado al lanzador con textContent', () => {
    const { fromFrame, button, frame } = setup()
    fromFrame({ ...profile, launcher: '<img src=x onerror=alert(1)>' })
    expect(button()!.style.display).toBe('inline-flex')
    expect(button()!.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(button()!.querySelector('img')).toBeNull()
    expect(button()!.style.left).toBe('16px')
    expect(frame!.style.left).toBe('16px')
  })

  it('abre y cierra por boton y por API, avisa al frame y entrega unread', () => {
    const { handle, fromFrame, button, frame, posted } = setup()
    fromFrame(profile)
    const unread = vi.fn()
    handle!.api('on', 'unread', unread)
    button()!.click()
    expect(frame!.style.display).toBe('block')
    expect(button()!.getAttribute('aria-expanded')).toBe('true')
    expect(posted.at(-1)).toMatchObject({ msg: { t: 'open' }, target: HUB })
    fromFrame({ mcs: 1, t: 'close' })
    expect(frame!.style.display).toBe('none')
    fromFrame({ mcs: 1, t: 'unread', count: 3 })
    expect(unread).toHaveBeenCalledWith(3)
    fromFrame({ mcs: 1, t: 'unread', count: -1 })
    expect(unread).toHaveBeenCalledTimes(1)
  })

  it('identify espera a ready, solo envia JWT bien formados y logout lo borra', () => {
    const { handle, fromFrame, posted } = setup()
    const jwt = 'aaa.bbb.ccc'
    handle!.api('identify', { token: jwt })
    expect(posted.filter((p) => (p.msg as { t: string }).t === 'identify')).toHaveLength(0)
    fromFrame({ mcs: 1, t: 'ready' })
    expect(posted.filter((p) => (p.msg as { t: string }).t === 'identify')).toHaveLength(1)
    handle!.api('logout')
    expect(posted.at(-1)).toMatchObject({ msg: { t: 'logout' } })
    expect(parseToFrame({ mcs: 1, t: 'identify', token: 'no es un jwt' })).toBeNull()
    expect(parseToFrame({ mcs: 1, t: 'identify', token: 'a.b.c'.padEnd(5000, 'c') })).toBeNull()
  })

  it('se retira cuando el frame informa que no esta disponible', () => {
    const { fromFrame } = setup()
    fromFrame({ mcs: 1, t: 'unavailable' })
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('button')).toBeNull()
  })

  it('installLoader reproduce la cola del snippet y expone MetacoreSupport', () => {
    const q: unknown[] = [['identify', { token: 'a.b.c' }], ['on', 'unread', () => {}]]
    const w = window as Window & { MetacoreSupport?: LoaderApi }
    const stub = (() => {}) as LoaderApi
    stub.q = q as never
    w.MetacoreSupport = stub
    const handle = installLoader({ doc: document, win: window, script: script() })
    expect(handle).not.toBeNull()
    expect(w.MetacoreSupport).not.toBe(stub)
    expect(() => w.MetacoreSupport!('open')).not.toThrow()
    delete w.MetacoreSupport
  })

  it('el parseo del protocolo rechaza versiones y tipos desconocidos', () => {
    expect(parseToParent({ mcs: 2, t: 'ready' })).toBeNull()
    expect(parseToParent({ mcs: 1, t: 'eval', code: 'x' })).toBeNull()
    expect(parseToFrame(null)).toBeNull()
  })
})
