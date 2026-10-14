// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
const toastDismiss = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    dismiss: (...a: unknown[]) => toastDismiss(...a),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

const showNotificationToast = vi.fn()
vi.mock('@asteby/metacore-notifications', () => ({
  showNotificationToast: (o: unknown) => showNotificationToast(o),
}))

let offlineReadyCb: (() => void) | undefined
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opts: { onOfflineReady?: () => void }) => {
    offlineReadyCb = opts.onOfflineReady
    return { needRefresh: [false, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker: vi.fn() }
  },
}))

const ctx = { needRefresh: true, updateApp: vi.fn(), closeUpdatePrompt: vi.fn() }
vi.mock('../src/use-modal-open', () => ({ useModalOpen: () => false, hasOpenModal: () => false }))

beforeEach(() => {
  toastSuccess.mockReset()
  toastDismiss.mockReset()
  showNotificationToast.mockReset()
  offlineReadyCb = undefined
})
afterEach(() => cleanup())

describe('PWAProvider offlineReadyToast', () => {
  async function mount(props: Record<string, unknown>) {
    const { PWAProvider } = await import('../src/provider')
    render(<PWAProvider {...props}>x</PWAProvider>)
    expect(offlineReadyCb).toBeTypeOf('function')
    offlineReadyCb!()
  }

  it('shows the default toast by default', async () => {
    await mount({})
    expect(toastSuccess).toHaveBeenCalledWith('App lista para funcionar sin conexión')
  })

  it('false silences it', async () => {
    await mount({ offlineReadyToast: false })
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('a function replaces it and receives the message', async () => {
    const custom = vi.fn()
    await mount({ offlineReadyToast: custom, messages: { offlineReady: 'Listo offline' } })
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(custom).toHaveBeenCalledWith('Listo offline')
  })
})

describe('PWAUpdatePrompt', () => {
  async function mount(props: Record<string, unknown>) {
    const provider = await import('../src/provider')
    vi.spyOn(provider, 'usePWAContext').mockReturnValue(ctx as never)
    const { PWAUpdatePrompt } = await import('../src/components/update-prompt')
    render(<PWAUpdatePrompt {...props} />)
  }

  it('shows the shared notification toast by default', async () => {
    await mount({})
    expect(showNotificationToast).toHaveBeenCalledTimes(1)
  })

  it('enabled=false never shows it', async () => {
    await mount({ enabled: false })
    expect(showNotificationToast).not.toHaveBeenCalled()
  })

  it('renderToast replaces the default card', async () => {
    const renderToast = vi.fn()
    await mount({ renderToast, messages: { title: 'Nueva versión' } })
    expect(showNotificationToast).not.toHaveBeenCalled()
    expect(renderToast).toHaveBeenCalledTimes(1)
    const arg = renderToast.mock.calls[0]![0]
    expect(arg).toMatchObject({ toastId: 'sys:app-update', title: 'Nueva versión', duration: Infinity })
    arg.update()
    expect(ctx.updateApp).toHaveBeenCalled()
  })
})
