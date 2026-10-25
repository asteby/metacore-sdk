// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { Money, PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { PaymentHttpError, mercadoPagoBricksAdapter, mountQueued, useEmbeddedPayment, type EmbeddedPaymentState, type MercadoPagoCtor, type PaymentFormAdapter, type PaymentTransport } from './index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const client: PaymentClient = { kind: 'mercadopago_bricks', sdk_url: 'https://sdk.mercadopago.com/js/v2', public_key: 'APP_USR-test', options: [{ key: 'card', redirect: false }] }
const money = (n: number): Money => ({ amount: n.toFixed(2), currency_code: 'MXN' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * A fake Mercado Pago SDK with slow, asynchronous `create` / `unmount` / `update`, like the real one. It records
 * everything that could go wrong: a `create` on an id that is not in the DOM, two forms alive at once, a create that
 * starts before the previous form finished unmounting.
 */
function fakeMercadoPago(opts: { createMs?: number; unmountMs?: number; updateMs?: number; hangCreates?: number; failUpdate?: boolean; noUpdate?: boolean } = {}) {
  const { createMs = 8, unmountMs = 8, updateMs = 8 } = opts
  const log = { creates: 0, updates: [] as number[], unmounts: 0, createdOnMissingNode: 0, alive: 0, maxAlive: 0, createWhileUnmounting: 0, events: [] as string[] }
  let unmounting = 0
  let hang = opts.hangCreates ?? 0
  class MP {
    bricks() {
      return {
        create: async (_brick: string, id: string, settings: { initialization?: { amount?: number }; callbacks?: { onReady?: () => void } }) => {
          log.creates++
          log.events.push(`create:${settings.initialization?.amount}`)
          const node = typeof document !== 'undefined' ? document.getElementById(id) : null
          if (!node || !node.isConnected) {
            log.createdOnMissingNode++
            throw new Error('container_not_found')
          }
          if (unmounting > 0) log.createWhileUnmounting++
          if (hang > 0) {
            hang--
            return new Promise<never>(() => {})
          }
          await sleep(createMs)
          // The node can leave the DOM while the provider is creating (React removed it): the provider fails, as the real one does.
          if (!document.getElementById(id)) throw new Error('container_not_found')
          log.alive++
          log.maxAlive = Math.max(log.maxAlive, log.alive)
          queueMicrotask(() => settings.callbacks?.onReady?.())
          return {
            getFormData: async () => ({ token: 'tok_1', payment_method_id: 'visa', installments: 1 }),
            unmount: async () => {
              unmounting++
              log.events.push('unmount:start')
              await sleep(unmountMs)
              log.unmounts++
              log.alive--
              unmounting--
              log.events.push('unmount:end')
            },
            ...(opts.noUpdate
              ? {}
              : {
                  update: async (s: { amount: number }) => {
                    log.events.push(`update:${s.amount}`)
                    await sleep(updateMs)
                    if (opts.failUpdate) throw new Error('update failed')
                    log.updates.push(s.amount)
                  },
                }),
          }
        },
      }
    }
  }
  return { log, ctor: MP as unknown as MercadoPagoCtor }
}

const approved: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }

type HarnessProps = {
  amount: Money
  email?: string
  transport?: PaymentTransport
  adapter: PaymentFormAdapter
  sdkTimeoutMs?: number
  createTimeoutMs?: number
  verifyIntervalMs?: number
  verifyTimeoutMs?: number
  holder: { current: EmbeddedPaymentState | null }
}
function Harness({ holder, amount, email, transport, adapter, ...rest }: HarnessProps) {
  const state = useEmbeddedPayment({
    client,
    amount,
    ...(email ? { email } : {}),
    transport: transport ?? { submit: async () => approved },
    adapter,
    storage: null,
    sdkTimeoutMs: rest.sdkTimeoutMs ?? 2000,
    ...(rest.createTimeoutMs ? { createTimeoutMs: rest.createTimeoutMs } : {}),
    ...(rest.verifyIntervalMs ? { verifyIntervalMs: rest.verifyIntervalMs } : {}),
    ...(rest.verifyTimeoutMs ? { verifyTimeoutMs: rest.verifyTimeoutMs } : {}),
  })
  holder.current = state
  return <div ref={state.containerRef} />
}
const holder = () => ({ current: null as EmbeddedPaymentState | null })

describe('embedded card form is stable', () => {
  it('three total changes in a row: ONE create, three updates, no remount', async () => {
    const mp = fakeMercadoPago()
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    for (const [i, total] of [110, 120, 130].entries()) {
      view.rerender(<Harness holder={h} amount={money(total)} adapter={adapter} />)
      await waitFor(() => expect(mp.log.updates).toHaveLength(i + 1))
    }
    expect(mp.log.creates).toBe(1)
    expect(mp.log.updates).toEqual([110, 120, 130])
    expect(mp.log.unmounts).toBe(0)
    expect(h.current?.status).toBe('ready')
  })

  it('totals that change faster than the provider answers end on the last one, without remounting', async () => {
    const mp = fakeMercadoPago({ updateMs: 20 })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    for (const t of [110, 120, 130]) view.rerender(<Harness holder={h} amount={money(t)} adapter={adapter} />)
    await waitFor(() => expect(mp.log.updates.at(-1)).toBe(130))
    expect(mp.log.creates).toBe(1)
    expect(mp.log.unmounts).toBe(0)
  })

  it('a total that changes while the form is still being created is applied right after', async () => {
    const mp = fakeMercadoPago({ createMs: 40 })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await sleep(10)
    view.rerender(<Harness holder={h} amount={money(150)} adapter={adapter} />)
    await waitFor(() => expect(mp.log.updates).toEqual([150]))
    expect(mp.log.creates).toBe(1)
  })

  it('typing the e-mail after the mount does not remount the form', async () => {
    const mp = fakeMercadoPago()
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    view.rerender(<Harness holder={h} amount={money(100)} email="ana@correo.mx" adapter={adapter} />)
    view.rerender(<Harness holder={h} amount={money(100)} email="otra@correo.mx" adapter={adapter} />)
    await sleep(60)
    expect(mp.log.creates).toBe(1)
    expect(mp.log.unmounts).toBe(0)
    expect(mp.log.updates).toEqual([])
  })

  it('a total change during the charge is applied AFTER the answer, never while onSubmit is in flight', async () => {
    const mp = fakeMercadoPago()
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    let answer!: (r: PaymentAttemptResult) => void
    const transport: PaymentTransport = { submit: () => new Promise((r) => (answer = r)) }
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} transport={transport} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let done!: Promise<void>
    act(() => {
      done = h.current!.submit()
    })
    await waitFor(() => expect(h.current?.status).toBe('processing'))
    view.rerender(<Harness holder={h} amount={money(140)} adapter={adapter} transport={transport} />)
    await sleep(60)
    expect(mp.log.updates).toEqual([])
    expect(mp.log.creates).toBe(1)
    await act(async () => {
      answer(approved)
      await done
    })
    await waitFor(() => expect(mp.log.updates).toEqual([140]))
    expect(mp.log.creates).toBe(1)
  })

  it('when update fails the form is remounted ONCE, queued: the old form finishes unmounting before the new create', async () => {
    const mp = fakeMercadoPago({ failUpdate: true })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    view.rerender(<Harness holder={h} amount={money(120)} adapter={adapter} />)
    await waitFor(() => expect(mp.log.creates).toBe(2))
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    expect(mp.log.createWhileUnmounting).toBe(0)
    expect(mp.log.maxAlive).toBe(1)
    expect(mp.log.createdOnMissingNode).toBe(0)
    // The new form is created with the new total.
    expect(mp.log.events.filter((e) => e.startsWith('create:'))).toEqual(['create:100', 'create:120'])
  })

  it('a provider build without update remounts on a total change, queued', async () => {
    const mp = fakeMercadoPago({ noUpdate: true })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    view.rerender(<Harness holder={h} amount={money(120)} adapter={adapter} />)
    await waitFor(() => expect(mp.log.creates).toBe(2))
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    expect(mp.log.createWhileUnmounting).toBe(0)
    expect(mp.log.maxAlive).toBe(1)
  })

  it('unmounting the component while the form is being created leaves no live form and no create on a detached node', async () => {
    const mp = fakeMercadoPago({ createMs: 40 })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    const view = render(<Harness holder={h} amount={money(100)} adapter={adapter} />)
    await sleep(15) // create is in flight
    view.unmount()
    await waitFor(() => expect(mp.log.alive).toBe(0))
    await sleep(80)
    expect(mp.log.alive).toBe(0)
    expect(mp.log.createdOnMissingNode).toBe(0)
  })

  it('a create that never resolves times out and falls back instead of hanging the form', async () => {
    const mp = fakeMercadoPago({ hangCreates: 1 })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = holder()
    render(<Harness holder={h} amount={money(100)} adapter={adapter} sdkTimeoutMs={120} createTimeoutMs={40} />)
    await waitFor(() => expect(h.current?.status).toBe('fallback'))
    expect(h.current?.fallbackReason).toBe('sdk_timeout')
  })
})

describe('mount queue', () => {
  function fakeAdapter(createMs: number, hang = 0) {
    const calls = { creates: 0, onDetached: 0, alive: 0, maxAlive: 0, ids: [] as string[] }
    let hangLeft = hang
    const adapter: PaymentFormAdapter = {
      kind: 'fake',
      async load() {},
      async mount(o) {
        calls.creates++
        calls.ids.push(o.container.id)
        if (!o.container.isConnected) calls.onDetached++
        if (hangLeft > 0) {
          hangLeft--
          return new Promise<never>(() => {})
        }
        await sleep(createMs)
        calls.alive++
        calls.maxAlive = Math.max(calls.maxAlive, calls.alive)
        return {
          collect: async () => ({ provider_data: { token: 't' } }),
          unmount: async () => {
            await sleep(5)
            calls.alive--
          },
        }
      },
    }
    return { adapter, calls }
  }
  const opts = (container: HTMLElement, signal?: AbortSignal) => ({ container, client, amount: money(1), onReady: () => {}, onError: () => {}, ...(signal ? { signal } : {}) })

  it('a mount queued behind a container that left the DOM never calls create on it', async () => {
    const { adapter, calls } = fakeAdapter(30)
    const container = document.createElement('div')
    container.id = 'sf-pay-x'
    document.body.append(container)
    const first = mountQueued(adapter, opts(container)).catch((e: Error) => e)
    await sleep(3) // `create` is in flight
    const second = mountQueued(adapter, opts(container)).catch((e: Error) => e)
    await sleep(3)
    container.remove()
    const [m1, e2] = await Promise.all([first, second])
    expect(calls.onDetached).toBe(0)
    expect(calls.creates).toBe(1)
    expect(m1).toBeInstanceOf(Error) // cancelled: the container left while creating
    expect((e2 as Error).name).toBe('PaymentMountCancelled')
    expect(calls.alive).toBe(0)
  })

  it('one at a time, each on its own inner node with a unique id', async () => {
    const { adapter, calls } = fakeAdapter(10)
    const container = document.createElement('div')
    container.id = 'sf-pay-y'
    document.body.append(container)
    const a = await mountQueued(adapter, opts(container))
    const pb = mountQueued(adapter, opts(container))
    await a.unmount()
    const b = await pb
    expect(new Set(calls.ids).size).toBe(2)
    expect(calls.ids.every((id) => id.startsWith('sf-pay-y-'))).toBe(true)
    expect(calls.maxAlive).toBe(1)
    await b.unmount()
    expect(container.children).toHaveLength(0)
  })

  it('a hung create is abandoned after the time limit and the next mount goes through', async () => {
    const { adapter, calls } = fakeAdapter(5, 1)
    const container = document.createElement('div')
    container.id = 'sf-pay-z'
    document.body.append(container)
    const ac = new AbortController()
    const stuck = mountQueued(adapter, opts(container, ac.signal), { createTimeoutMs: 30 }).catch((e: Error) => e)
    await sleep(5)
    ac.abort()
    const ok = await mountQueued(adapter, opts(container), { createTimeoutMs: 30 })
    expect(((await stuck) as Error).name).toBe('PaymentMountTimeout')
    expect(calls.creates).toBe(2)
    expect(typeof ok.collect).toBe('function')
  })
})

describe('unknown outcome keeps being checked', () => {
  const pending: PaymentAttemptResult = { payment: { provider: 'mp', status: 'pending', outcome: 'pending', action: { type: 'none' } } }

  it('after "verifying" the hook keeps reading refresh with growing waits until OPS resolves, on the SAME attempt', async () => {
    const mp = fakeMercadoPago()
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const submit = vi.fn(async () => {
      throw new PaymentHttpError(503, 'network', 'verificando', undefined, { retryable: true, kind: 'transient' })
    })
    let polls = 0
    const refresh = vi.fn(async (): Promise<PaymentAttemptResult> => {
      polls++
      if (polls === 1) return { payment: { provider: '', status: 'none' }, recoverable: true }
      if (polls === 2) return pending
      return approved
    })
    const onResult = vi.fn()
    const h = holder()
    function WithResult() {
      const state = useEmbeddedPayment({ client, amount: money(100), transport: { submit, refresh }, adapter, storage: null, autoRetries: 0, verifyIntervalMs: 10, onResult })
      h.current = state
      return <div ref={state.containerRef} />
    }
    render(<WithResult />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      await h.current!.submit()
    })
    expect(h.current?.status).toBe('network_error')
    await waitFor(() => expect(h.current?.status).toBe('approved'), { timeout: 3000 })
    expect(refresh).toHaveBeenCalledTimes(3) // `none` and `pending` did not end it
    expect(submit).toHaveBeenCalledTimes(1) // never charged again
    expect(onResult).toHaveBeenCalledOnce()
  })
})
