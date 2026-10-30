/**
 * Mount queue for provider forms. Provider SDKs (Mercado Pago Bricks among them) resolve their container by id,
 * asynchronously, and unmount asynchronously too. Without care, a remount races the previous unmount on the same node
 * and the provider answers `container_not_found`, leaves an empty form, or draws two.
 *
 * Guarantees, per container element:
 * - ONE mount at a time: a new mount waits for the previous one to finish tearing down (`await unmount`) before `create`.
 * - Each mount gets its OWN inner node with a unique id, so the provider never looks for an id React already replaced.
 * - A mount that was cancelled (`signal`) or whose container left the DOM never calls the provider; one that finishes
 *   late is torn down instead of kept.
 * - `create` has a time limit: a provider call that never resolves cannot freeze the chain.
 */
import type { PaymentAction } from '@asteby/storefront'
import type { MountedPaymentForm, PaymentFormAdapter, PaymentFormMountOptions } from './adapter.js'

export class PaymentMountCancelled extends Error {
  override readonly name = 'PaymentMountCancelled'
  constructor(message = 'payment form: mount cancelled') {
    super(message)
  }
}

export class PaymentMountTimeout extends Error {
  override readonly name = 'PaymentMountTimeout'
  constructor(ms: number) {
    super(`payment form: create timeout after ${ms}ms`)
  }
}

export type MountQueueOptions = {
  /** Longest wait for the provider's `create`. Default 10000. */
  createTimeoutMs?: number
}

type Chain = { tail: Promise<void>; active: { teardown(): Promise<void> } | null; ticket: number }
const chains = new WeakMap<HTMLElement, Chain>()
let seq = 0

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PaymentMountTimeout(ms)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/** Mounts `base` on `opts.container` through the queue. See the module comment for the guarantees. */
export async function mountQueued(base: PaymentFormAdapter, opts: PaymentFormMountOptions, queue: MountQueueOptions = {}): Promise<MountedPaymentForm> {
  const container = opts.container
  const createTimeoutMs = queue.createTimeoutMs ?? 10_000
  let chain = chains.get(container)
  if (!chain) {
    chain = { tail: Promise.resolve(), active: null, ticket: 0 }
    chains.set(container, chain)
  }
  const me = chain
  let release!: () => void
  const done = new Promise<void>((r) => (release = r))
  const previous = me.tail
  const ticket = ++me.ticket
  me.tail = done
  let released = false
  const finish = () => {
    if (!released) {
      released = true
      release()
    }
  }
  // Cancelled: asked to stop, the container left the DOM, or a newer mount took this container over.
  const cancelled = () => opts.signal?.aborted === true || !container.isConnected || me.ticket !== ticket

  let slot: HTMLElement | null = null
  try {
    // A form still on screen in this container is replaced: tear it down, then wait for whatever was queued before.
    if (me.active) await me.active.teardown()
    await previous
    if (cancelled()) throw new PaymentMountCancelled()

    slot = container.ownerDocument.createElement('div')
    slot.id = `${container.id || 'sf-pay'}-m${++seq}`
    container.replaceChildren(slot)
    const node = slot

    const pending = base.mount({ ...opts, container: node })
    let handle: MountedPaymentForm
    try {
      handle = await withTimeout(pending, createTimeoutMs)
    } catch (err) {
      // A create that finishes after we gave up must not leave a live form behind.
      void pending.then((h) => Promise.resolve(h.unmount()).catch(() => {}), () => {})
      throw err
    }

    let torn: Promise<void> | null = null
    const teardown = () =>
      (torn ??= (async () => {
        try {
          await handle.unmount()
        } catch {
          /* the provider may already have removed it */
        }
        node.remove()
        if (me.active === entry) me.active = null
        finish()
      })())
    const entry = { teardown }
    me.active = entry

    // The container may have left the DOM (or the mount been cancelled) while the provider was creating.
    if (cancelled() || !node.isConnected) {
      await teardown()
      throw new PaymentMountCancelled()
    }
    return {
      collect: () => handle.collect(),
      ...(handle.update ? { update: (next: { amount: PaymentFormMountOptions['amount'] }) => handle.update!(next) } : {}),
      ...(handle.handleAction ? { handleAction: (action: PaymentAction) => handle.handleAction!(action) } : {}),
      unmount: teardown,
    }
  } catch (err) {
    slot?.remove()
    finish()
    throw err
  }
}

/** Wraps an adapter so every `mount` goes through the queue. The hook already does this for any adapter it uses. */
export function withMountQueue(adapter: PaymentFormAdapter, queue: MountQueueOptions = {}): PaymentFormAdapter {
  return { kind: adapter.kind, load: (client, options) => adapter.load(client, options), mount: (opts) => mountQueued(adapter, opts, queue) }
}
