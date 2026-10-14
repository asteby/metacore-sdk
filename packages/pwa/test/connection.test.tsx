// @vitest-environment happy-dom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetConnectionState,
  attachConnectionReporter,
  onConnectionRestored,
  reportNetworkError,
  useConnectionState,
} from '../src/connection'
import { OfflineIndicator } from '../src/components/offline-indicator'

const state = () => renderHook(() => useConnectionState()).result.current

describe('connection', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    __resetConnectionState()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('un fallo suelto con el servidor respondiendo no avisa', async () => {
    fetchMock.mockResolvedValue({ status: 200 })
    reportNetworkError()
    expect(state()).toBe('checking')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchMock).toHaveBeenCalledWith('/api/push/public-key', expect.anything())
    expect(state()).toBe('online')
  })

  it('una caída más larga que la gracia avisa y al volver se anuncia una vez', async () => {
    const restored = vi.fn()
    onConnectionRestored(restored)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    reportNetworkError()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(state()).toBe('checking')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(state()).toBe('offline')

    fetchMock.mockResolvedValue({ status: 200 })
    for (let i = 0; i < 31 && state() !== 'restored'; i++) await vi.advanceTimersByTimeAsync(1_000)
    expect(state()).toBe('restored')
    expect(restored).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3_100)
    expect(state()).toBe('online')
  })

  it('502–504 del proxy cuentan como servidor caído', async () => {
    fetchMock.mockResolvedValue({ status: 503 })
    reportNetworkError()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(state()).toBe('offline')
  })

  it('con la pestaña oculta los fallos no cuentan', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    reportNetworkError()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state()).toBe('online')
  })

  it('al volver de segundo plano ignora los cortes de los primeros segundos, pero no al cargar', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    // Sin visibilitychange (página recién cargada): el fallo sí cuenta.
    reportNetworkError()
    expect(state()).toBe('checking')
    __resetConnectionState()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    document.dispatchEvent(new Event('visibilitychange'))
    reportNetworkError()
    expect(state()).toBe('online')
    await vi.advanceTimersByTimeAsync(4_100)
    reportNetworkError()
    expect(state()).toBe('checking')
  })

  it('sin red del dispositivo avisa «no-internet» sin consultar al servidor', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    reportNetworkError()
    expect(state()).toBe('no-internet')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('attachConnectionReporter: error de red reporta y cualquier respuesta recupera', async () => {
    let onOk: (r: unknown) => unknown = (r) => r
    let onErr: (e: unknown) => unknown = (e) => e
    attachConnectionReporter({ interceptors: { response: { use: (a, b) => ((onOk = a), (onErr = b), 0) } } })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(onErr({ code: 'ERR_NETWORK', message: 'Network Error' })).rejects.toBeTruthy()
    expect(state()).toBe('checking')
    await expect(onErr({ response: { status: 404 } })).rejects.toBeTruthy()
    expect(state()).toBe('online')
    onOk({ status: 200 })
    expect(state()).toBe('online')
  })

  it('acepta un cliente tipado como axios (genérico, rechazo any)', () => {
    type Res = { status: number; data: unknown }
    // Misma forma que AxiosInterceptorManager<AxiosResponse>.use
    const axiosLike: {
      interceptors: {
        response: {
          use(
            onFulfilled?: ((value: Res) => Res | Promise<Res>) | null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onRejected?: ((error: any) => any) | null,
            options?: unknown,
          ): number
        }
      }
    } = { interceptors: { response: { use: () => 7 } } }
    expect(attachConnectionReporter(axiosLike)).toBe(7)
  })

  it('OfflineIndicator solo se ve cuando hay algo que decir', async () => {
    const { container } = render(<OfflineIndicator />)
    expect(container.textContent).toBe('')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    act(() => reportNetworkError())
    expect(container.textContent).toContain('Sin internet')
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })
})
