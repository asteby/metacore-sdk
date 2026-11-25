// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initLoader, installLoader, type LoaderApi, type LoaderHandle } from './loader'

const HUB = 'https://hub.example'
const SRC = `${HUB}/embed/support/v1/loader.js`
const CH = 'sch_7K3M9Q2X8V4N1P6R5T0WABCDEF'
const JWT = 'eyJhbGciOi.eyJpc3MiOiJz.c2lnbmF0dXJl'

const base = { mcs: 1, t: 'profile', position: 'bottom-right', launcher: 'Ayuda', brand_color: '#0E7490', on_brand: '#ffffff' }
const profile = (over: Record<string, unknown> = {}) => ({ ...base, ...over })

interface Posted {
  msg: Record<string, unknown>
  target: string
}

/** Arma un loader con el iframe falso (sin red) y utilidades para hablarle como lo haria el frame. */
function setup(dataset: Record<string, string> = {}, opts: { init?: object; targetWaitMs?: number; src?: string } = {}) {
  const script = { src: opts.src ?? SRC, dataset: { channel: CH, locale: 'es-MX', ...dataset } } as never
  const posted: Posted[] = []
  const fake = { postMessage: (msg: Posted['msg'], target: string) => posted.push({ msg, target }) } as unknown as Window
  const handle = initLoader({ doc: document, win: window, script, init: opts.init as never, targetWaitMs: opts.targetWaitMs ?? 80 })
  const frame = (): HTMLIFrameElement | null => {
    const f = document.querySelector('iframe')
    if (f && f.contentWindow !== fake) Object.defineProperty(f, 'contentWindow', { value: fake, configurable: true })
    return f
  }
  const fromFrame = (data: unknown, origin = HUB, source: unknown = fake) => {
    frame()
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }))
  }
  const button = () => document.querySelector('button') as HTMLButtonElement | null
  return { handle: handle as LoaderHandle, posted, frame, fromFrame, button }
}

const container = (id = 'soporte', parent: HTMLElement = document.body) => {
  const el = document.createElement('div')
  el.id = id
  parent.append(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  vi.useRealTimers()
})

describe('modo floating', () => {
  it('es el defecto cuando el perfil no trae display_mode', () => {
    const { fromFrame, frame, button } = setup()
    fromFrame(profile())
    expect(frame()!.parentElement).toBe(document.body)
    expect(frame()!.style.position).toBe('fixed')
    expect(button()!.style.display).toBe('inline-flex')
    expect(button()!.style.bottom).toBe('16px')
  })

  it('respeta offset, panel_width, position y forma del lanzador del perfil', () => {
    const { fromFrame, frame, button } = setup()
    fromFrame(profile({ position: 'bottom-left', offset: 30, panel_width: 500, launcher_shape: 'square', launcher_label: 'Chatea' }))
    expect(button()!.style.left).toBe('30px')
    expect(button()!.style.bottom).toBe('30px')
    expect(button()!.style.borderRadius).toBe('14px')
    expect(button()!.textContent).toBe('Chatea')
    expect(frame()!.style.width).toBe('500px')
    expect(frame()!.style.bottom).toBe('94px')
  })

  it('un display_mode desconocido se descarta y un ancho fuera de rango se acota', () => {
    const { fromFrame, button, frame } = setup()
    fromFrame(profile({ display_mode: 'fullscreen', offset: 'mucho', panel_width: 99999, inline_target: 42 }))
    expect(button()!.style.display).toBe('inline-flex')
    expect(frame()!.style.position).toBe('fixed')
    expect(frame()!.style.width).toBe('720px')
  })
})

describe('modo inline', () => {
  it('con data-mode y data-target monta el iframe dentro del elemento, sin lanzador ni posicion fija', () => {
    const box = container('soporte')
    const { frame, button } = setup({ mode: 'inline', target: '#soporte', height: '480' })
    expect(frame()!.parentElement).toBe(box)
    expect(frame()!.style.height).toBe('480px')
    expect(frame()!.style.width).toBe('100%')
    expect(frame()!.style.position).not.toBe('fixed')
    expect(frame()!.getAttribute('aria-hidden')).toBe('false')
    expect(button()).toBeNull()
    expect(frame()!.getAttribute('sandbox')).toContain('allow-scripts')
  })

  it('anuncia el modo en hello y vuelve a abrir al estar listo (el frame cuenta como leido)', () => {
    container('soporte')
    const { frame, posted, fromFrame } = setup({ mode: 'inline', target: '#soporte' })
    frame()!.dispatchEvent(new Event('load'))
    expect(posted[0]).toMatchObject({ target: HUB, msg: { t: 'hello', mode: 'inline' } })
    fromFrame({ mcs: 1, t: 'ready' })
    expect(posted.at(-1)).toMatchObject({ msg: { t: 'open' }, target: HUB })
  })

  it('con el modo en el perfil traslada el iframe al destino y toma inline_height', () => {
    const box = container('chat')
    const { fromFrame, frame, button } = setup()
    expect(frame()!.parentElement).toBe(document.body)
    fromFrame(profile({ display_mode: 'inline', inline_target: '#chat', inline_height: 700 }))
    expect(frame()!.parentElement).toBe(box)
    expect(frame()!.style.height).toBe('700px')
    expect(button()).toBeNull()
  })

  it('usa #metacore-support si nadie indica el destino', () => {
    const box = container('metacore-support')
    const { frame } = setup({ mode: 'inline' })
    expect(frame()!.parentElement).toBe(box)
  })

  it('open/close/toggle no hacen nada y un close del frame no lo oculta', () => {
    container('soporte')
    const { handle, fromFrame, frame } = setup({ mode: 'inline', target: '#soporte' })
    handle.api('close')
    handle.api('toggle')
    fromFrame({ mcs: 1, t: 'close' })
    expect(frame()!.style.display).toBe('block')
  })

  it('si el destino no existe aun, espera con MutationObserver y monta cuando aparece', async () => {
    const { frame, handle } = setup({ mode: 'inline', target: '#tarde' }, { targetWaitMs: 5000 })
    expect(frame()).toBeNull()
    const parent = container('contenedor')
    const late = container('tarde', parent)
    await vi.waitFor(() => expect(frame()?.parentElement).toBe(late))
    handle.destroy()
  })

  it('si el destino nunca aparece falla en silencio y no deja rastro en la pagina', async () => {
    const { frame, button, posted } = setup({ mode: 'inline', target: '#nunca' }, { targetWaitMs: 30 })
    await new Promise((r) => setTimeout(r, 80))
    expect(frame()).toBeNull()
    expect(button()).toBeNull()
    expect(document.body.children).toHaveLength(0)
    expect(posted).toHaveLength(0)
  })

  it('un selector invalido no lanza: se trata como inexistente', async () => {
    expect(() => setup({ mode: 'inline', target: '##malo[[' }, { targetWaitMs: 20 })).not.toThrow()
    await new Promise((r) => setTimeout(r, 60))
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('con el modo del perfil y destino ausente retira el iframe aparcado al vencer la espera', async () => {
    const { fromFrame, frame } = setup({}, { targetWaitMs: 30 })
    fromFrame(profile({ display_mode: 'inline', inline_target: '#nada' }))
    expect(frame()).not.toBeNull()
    await new Promise((r) => setTimeout(r, 80))
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('button')).toBeNull()
  })
})

describe('modo push', () => {
  it('muestra el riel, abre el panel lateral y empuja el cuerpo; al cerrar lo restaura', () => {
    document.body.style.marginRight = '5px'
    const { fromFrame, frame, button } = setup()
    fromFrame(profile({ display_mode: 'push', panel_width: 420, launcher_label: 'Soporte' }))
    expect(frame()!.style.height).toBe('100vh')
    expect(frame()!.style.transform).toBe('translateX(100%)')
    expect(frame()!.style.visibility).toBe('hidden')
    expect(button()!.textContent).toContain('Soporte')
    button()!.click()
    expect(frame()!.style.transform).toBe('translateX(0)')
    expect(frame()!.style.visibility).toBe('visible')
    expect(document.body.style.marginRight).toBe('420px')
    expect(button()!.style.right).toBe('420px')
    button()!.click()
    expect(document.body.style.marginRight).toBe('5px')
    expect(frame()!.style.transform).toBe('translateX(100%)')
  })

  it('position bottom-left lo ancla a la izquierda y empuja marginLeft', () => {
    const { fromFrame, frame, button } = setup()
    fromFrame(profile({ display_mode: 'push', position: 'bottom-left' }))
    expect(frame()!.style.left).toBe('0px')
    expect(frame()!.style.transform).toBe('translateX(-100%)')
    button()!.click()
    expect(document.body.style.marginLeft).toBe('400px')
  })

  it('al desmontar con el panel abierto devuelve el margen original', () => {
    const { fromFrame, button, handle } = setup()
    fromFrame(profile({ display_mode: 'push' }))
    button()!.click()
    expect(document.body.style.marginRight).toBe('400px')
    handle.api('unmount')
    expect(document.body.style.marginRight).toBe('')
    expect(document.querySelector('iframe')).toBeNull()
  })
})

describe('el cliente manda sobre el perfil', () => {
  it('data-mode pisa display_mode del perfil', () => {
    const { fromFrame, frame, button } = setup({ mode: 'floating' })
    fromFrame(profile({ display_mode: 'push' }))
    expect(frame()!.style.height).not.toBe('100vh')
    expect(button()!.style.borderRadius).toBe('9999px')
  })

  it('init (opciones) pisa el perfil en modo, medidas y posicion', () => {
    const { fromFrame, frame, button } = setup({}, { init: { mode: 'floating', offset: 40, width: 500, position: 'bottom-left', launcherLabel: 'Hola' } })
    fromFrame(profile({ display_mode: 'push', offset: 5, panel_width: 300, position: 'bottom-right', launcher_label: 'Perfil' }))
    expect(button()!.style.bottom).toBe('40px')
    expect(button()!.style.left).toBe('40px')
    expect(button()!.textContent).toBe('Hola')
    expect(frame()!.style.width).toBe('500px')
  })

  it('init sobre un loader ya montado reajusta la presentacion', () => {
    const { handle, fromFrame, button } = setup()
    fromFrame(profile())
    handle.api('init', { offset: 60, launcherShape: 'rounded' })
    expect(button()!.style.bottom).toBe('60px')
    expect(button()!.style.borderRadius).toBe('20px')
  })

  it('ignora opciones de init con tipos o valores invalidos y acota las numericas', () => {
    const { fromFrame, button } = setup({}, { init: { mode: 'evil', offset: '9999', width: {}, launcherShape: 'star', target: 5 } })
    fromFrame(profile())
    expect(button()!.style.bottom).toBe('200px')
    expect(button()!.style.borderRadius).toBe('9999px')
  })
})

describe('comandos y cola', () => {
  const anchor = () => window as Window & { MetacoreSupport?: LoaderApi }
  const install = (queue: unknown[][], dataset: Record<string, string> = {}) => {
    const w = anchor()
    const stub = (() => {}) as LoaderApi
    stub.q = queue as never
    w.MetacoreSupport = stub
    const posted: Posted[] = []
    const fake = { postMessage: (msg: Posted['msg'], target: string) => posted.push({ msg, target }) } as unknown as Window
    const handle = installLoader({ doc: document, win: window, script: { src: SRC, dataset: { channel: CH, ...dataset } } as never, targetWaitMs: 80 })
    const frame = () => {
      const f = document.querySelector('iframe')
      if (f && f.contentWindow !== fake) Object.defineProperty(f, 'contentWindow', { value: fake, configurable: true })
      return f
    }
    const fromFrame = (data: unknown) => {
      frame()
      window.dispatchEvent(new MessageEvent('message', { data, origin: HUB, source: fake }))
    }
    return { handle, posted, frame, fromFrame }
  }
  afterEach(() => {
    delete anchor().MetacoreSupport
  })

  it('los init encolados configuran el arranque (modo inline en el destino) antes de montar', () => {
    const box = container('chat')
    const { frame, handle } = install([['init', { mode: 'inline', target: '#chat', height: 520 }]])
    expect(frame()!.parentElement).toBe(box)
    expect(frame()!.style.height).toBe('520px')
    handle!.destroy()
  })

  it('las ordenes anteriores a la carga se reproducen y las posteriores van directas', () => {
    const { handle, frame, posted, fromFrame } = install([['identify', { token: JWT }], ['setLanguage', 'en-US']])
    fromFrame(profile())
    expect(new URL(frame()!.src).searchParams.get('locale')).toBe('en-US')
    fromFrame({ mcs: 1, t: 'ready' })
    expect(posted.some((p) => p.msg.t === 'identify')).toBe(true)
    const api = anchor().MetacoreSupport!
    api('toggle')
    expect(posted.at(-1)!.msg.t).toBe('open')
    api('toggle')
    expect(posted.at(-1)!.msg.t).toBe('close')
    api('reset')
    expect(posted.at(-1)!.msg.t).toBe('logout')
    handle!.destroy()
  })

  it('un open encolado deja el panel abierto en cuanto se coloca el iframe', () => {
    const { handle, frame, fromFrame } = install([['open']])
    fromFrame(profile())
    expect(frame()!.style.display).toBe('block')
    handle!.destroy()
  })

  it('setLanguage recarga el frame con el idioma nuevo, valida el valor y re-identifica al estar listo', () => {
    const { handle, frame, posted, fromFrame } = install([['identify', { token: JWT }]])
    const api = anchor().MetacoreSupport!
    fromFrame({ mcs: 1, t: 'ready' })
    posted.length = 0
    api('setLanguage', 'en')
    api('setLanguage', '"><script>')
    expect(new URL(frame()!.src).searchParams.get('locale')).toBe('en')
    fromFrame({ mcs: 1, t: 'ready' })
    expect(posted.filter((p) => p.msg.t === 'identify')).toHaveLength(1)
    handle!.destroy()
  })

  it('unmount quita todo y mount lo vuelve a montar; con data-autostart=false espera a mount', () => {
    const { handle, frame } = install([], { autostart: 'false' })
    expect(frame()).toBeNull()
    const api = anchor().MetacoreSupport!
    api('mount', { mode: 'floating' })
    expect(frame()).not.toBeNull()
    api('unmount')
    expect(frame()).toBeNull()
    expect(document.body.children).toHaveLength(0)
    api('mount')
    expect(frame()).not.toBeNull()
    handle!.destroy()
  })

  it('mount puede traer el canal cuando el script no lo trae y lo valida', () => {
    const handle = initLoader({ doc: document, win: window, script: { src: SRC, dataset: { autostart: 'false' } } as never })
    handle!.api('mount', { channel: 'no-es-un-canal' })
    expect(document.querySelector('iframe')).toBeNull()
    handle!.api('mount', { channel: CH })
    expect(document.querySelector('iframe')).not.toBeNull()
    handle!.destroy()
  })

  it('con un canal invalido y autoarranque no instala nada y deja la cola intacta', () => {
    const w = anchor()
    const stub = (() => {}) as LoaderApi
    stub.q = [['open']] as never
    w.MetacoreSupport = stub
    expect(installLoader({ doc: document, win: window, script: { src: SRC, dataset: { channel: 'x' } } as never })).toBeNull()
    expect(w.MetacoreSupport).toBe(stub)
  })
})

describe('seguridad', () => {
  it('ignora el perfil de otro origen o de otra ventana: nada cambia de lugar ni de modo', () => {
    const box = container('chat')
    const { fromFrame, frame, button } = setup()
    const profileInline = profile({ display_mode: 'inline', inline_target: '#chat' })
    fromFrame(profileInline, 'https://evil.example')
    fromFrame(profileInline, HUB, window)
    fromFrame(profileInline, 'null')
    expect(frame()!.parentElement).toBe(document.body)
    expect(box.children).toHaveLength(0)
    expect(button()!.style.display).toBe('none')
  })

  it('nunca usa "*" como origen de destino', () => {
    container('chat')
    const { handle, fromFrame, frame, posted } = setup({ mode: 'inline', target: '#chat' })
    frame()!.dispatchEvent(new Event('load'))
    fromFrame({ mcs: 1, t: 'ready' })
    handle.api('identify', { token: JWT })
    handle.api('reset')
    expect(posted.length).toBeGreaterThan(2)
    expect(posted.every((p) => p.target === HUB)).toBe(true)
  })

  it('el token de identidad no llega al DOM del anfitrion ni a la URL del frame', () => {
    const { handle, fromFrame, frame, posted } = setup()
    fromFrame({ mcs: 1, t: 'ready' })
    handle.api('identify', { token: JWT })
    expect(posted.some((p) => p.msg.t === 'identify' && p.msg.token === JWT)).toBe(true)
    expect(document.documentElement.outerHTML).not.toContain(JWT)
    expect(frame()!.src).not.toContain(JWT)
    expect(frame()!.getAttributeNames().join(' ')).not.toContain('token')
  })

  it('un identify que no es un JWT bien formado no llega al frame (lo rechaza el parser del protocolo)', async () => {
    const { parseToFrame } = await import('./protocol')
    expect(parseToFrame({ mcs: 1, t: 'identify', token: '<script>alert(1)</script>' })).toBeNull()
    expect(parseToFrame({ mcs: 1, t: 'identify', token: JWT })).not.toBeNull()
  })

  it('el destino con texto hostil se usa solo como selector (nunca como HTML)', async () => {
    const { frame } = setup({ mode: 'inline', target: '<img src=x onerror=alert(1)>' }, { targetWaitMs: 10 })
    await new Promise((r) => setTimeout(r, 40))
    expect(frame()).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })
})
