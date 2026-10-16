import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  isStorefrontError,
  type AddressInput,
  type Cart,
  type CartBuyerInput,
  type CartLine,
  type CartLineInput,
  type CartLineMerchandise,
  type CartLineUpdateInput,
  type DeliveryInput,
  type DeliveryOptions,
  type Money,
  type StorefrontClient,
} from '@asteby/storefront'
import { useOptionalStorefront } from './context.js'
import { CART_COOKIE_NAME, readCartCookie, writeCartCookie, type CartCookieOptions } from './cookie.js'

export type CartLineAddInput = CartLineInput & {
  /** Variant data for an instant optimistic line (otherwise only the count updates until the server answers). */
  merchandise?: CartLineMerchandise
}

export type CartStatus = 'idle' | 'loading' | 'updating'

export type CartContextValue = {
  cart: Cart | null
  cartId: string | null
  status: CartStatus
  /** Last mutation error (cleared on the next successful mutation). */
  error: Error | null
  totalQuantity: number
  /** Adds lines, creating the cart on first use. Optimistic. */
  addLines: (lines: CartLineAddInput[]) => Promise<Cart | null>
  /** Sets line quantities (`0` removes). Optimistic. */
  updateLines: (lines: CartLineUpdateInput[]) => Promise<Cart | null>
  /** Removes lines. Optimistic. */
  removeLines: (lineIds: string[]) => Promise<Cart | null>
  setDiscountCodes: (codes: string[]) => Promise<Cart | null>
  setBuyer: (buyer: CartBuyerInput) => Promise<Cart | null>
  setShippingAddress: (address: AddressInput) => Promise<Cart | null>
  setDelivery: (delivery: DeliveryInput) => Promise<Cart | null>
  deliveryOptions: () => Promise<DeliveryOptions | null>
  /** Reloads the cart from the API. */
  refresh: () => Promise<Cart | null>
  /** Forgets the cart (clears state and cookie), e.g. after checkout. */
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export type CartProviderProps = {
  /** Cart loaded in the SSR loader (hydrates without a client fetch). */
  initialCart?: Cart | null
  /** Cart id known on the server when `initialCart` is not loaded. */
  cartId?: string | null
  /** Client override (defaults to the `StorefrontProvider` client). */
  client?: StorefrontClient
  /** Cookie settings for the persisted cart id (`sf_cart`). Pass `false` to disable the cookie. */
  cookie?: CartCookieOptions | false
  /** Currency for the optimistic placeholder cart (defaults to the provider currency). */
  currency?: string
  onError?: (error: Error) => void
  onCartChange?: (cart: Cart | null) => void
  children?: ReactNode
}

type PendingOp = { id: number; apply: (cart: Cart | null) => Cart | null }

const toCents = (m: Money | null | undefined) => (m ? Math.round(Number.parseFloat(m.amount) * 100) : 0)
const money = (cents: number, currency: string): Money => ({ amount: (cents / 100).toFixed(2), currency_code: currency })

function emptyCart(currency: string): Cart {
  const zero = money(0, currency)
  return {
    id: '',
    lines: [],
    total_quantity: 0,
    discount_codes: [],
    buyer: { email: null, phone: null, customer_id: null },
    shipping_address: null,
    delivery: { method: null, rate_id: null, branch_id: null },
    cost: { subtotal: zero, discount: zero, shipping: null, tax: null, total: zero, tax_included: true },
    updated_at: new Date(0).toISOString(),
  }
}

function withLines(cart: Cart, lines: CartLine[], totalQuantity?: number): Cart {
  const currency = cart.cost.subtotal.currency_code
  const subtotal = lines.reduce((sum, l) => sum + toCents(l.cost.total), 0)
  const total = Math.max(0, subtotal - toCents(cart.cost.discount) + toCents(cart.cost.shipping))
  return {
    ...cart,
    lines,
    total_quantity: totalQuantity ?? lines.reduce((sum, l) => sum + l.quantity, 0),
    cost: { ...cart.cost, subtotal: money(subtotal, currency), total: money(total, currency) },
  }
}

function lineWithQuantity(line: CartLine, quantity: number): CartLine {
  const unit = toCents(line.cost.unit)
  return { ...line, quantity, cost: { ...line.cost, total: money(unit * quantity, line.cost.unit.currency_code) } }
}

/** Pure optimistic reducers (exported for tests and custom carts). */
export const optimisticCart = {
  add(cart: Cart | null, input: CartLineAddInput[], currency: string): Cart {
    const base = cart ?? emptyCart(currency)
    let lines = base.lines.slice()
    let unknownQuantity = 0
    for (const l of input) {
      const idx = lines.findIndex((x) => x.merchandise.id === l.variant_id)
      if (idx >= 0) lines[idx] = lineWithQuantity(lines[idx]!, lines[idx]!.quantity + l.quantity)
      else if (l.merchandise) {
        const unit = l.merchandise.price
        lines.push({
          id: `optimistic:${l.variant_id}`,
          quantity: l.quantity,
          merchandise: l.merchandise,
          cost: { unit, compare_at_unit: l.merchandise.compare_at_price, total: money(toCents(unit) * l.quantity, unit.currency_code) },
        })
      } else unknownQuantity += l.quantity
    }
    const known = lines.reduce((sum, l) => sum + l.quantity, 0)
    return withLines(base, lines, known + unknownQuantity + (base.total_quantity - base.lines.reduce((s, l) => s + l.quantity, 0)))
  },
  update(cart: Cart | null, input: CartLineUpdateInput[]): Cart | null {
    if (!cart) return cart
    const byId = new Map(input.map((l) => [l.id, l.quantity]))
    const lines = cart.lines
      .map((l) => (byId.has(l.id) ? lineWithQuantity(l, byId.get(l.id)!) : l))
      .filter((l) => l.quantity > 0)
    return withLines(cart, lines)
  },
  remove(cart: Cart | null, lineIds: string[]): Cart | null {
    if (!cart) return cart
    return withLines(cart, cart.lines.filter((l) => !lineIds.includes(l.id)))
  },
}

const isNotFound = (err: unknown) => isStorefrontError(err) && err.status === 404

/**
 * Holds the cart and exposes optimistic mutations. Mutations run one at a
 * time in order; a failed one is rolled back without discarding the others.
 * The cart id is persisted in the `sf_cart` cookie (read it in loaders with
 * `getCartIdFromCookie`). No `window`/`document` access during render.
 */
export function CartProvider({
  initialCart = null,
  cartId: initialCartId = null,
  client: clientProp,
  cookie,
  currency: currencyProp,
  onError,
  onCartChange,
  children,
}: CartProviderProps) {
  const sf = useOptionalStorefront()
  const client = clientProp ?? sf?.client ?? null
  const currency = currencyProp ?? initialCart?.cost.subtotal.currency_code ?? sf?.currency ?? 'MXN'
  const cookieOptions = cookie === false ? null : (cookie ?? {})

  const confirmedRef = useRef<Cart | null>(initialCart)
  const pendingRef = useRef<PendingOp[]>([])
  const idRef = useRef<string | null>(initialCart?.id ?? initialCartId ?? null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const seqRef = useRef(0)
  const callbacks = useRef({ onError, onCartChange })
  callbacks.current = { onError, onCartChange }

  const [cart, setCart] = useState<Cart | null>(initialCart)
  const [cartId, setCartId] = useState<string | null>(idRef.current)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const render = useCallback(() => {
    const next = pendingRef.current.reduce<Cart | null>((acc, op) => op.apply(acc), confirmedRef.current)
    setCart(next)
  }, [])

  const persistId = useCallback(
    (id: string | null) => {
      if (idRef.current === id) return
      idRef.current = id
      setCartId(id)
      if (cookieOptions) writeCartCookie(id, cookieOptions)
    },
    // cookieOptions is a plain options bag; its identity is irrelevant
    [cookie === false, cookieOptions?.name],
  )

  const confirm = useCallback(
    (next: Cart | null) => {
      confirmedRef.current = next
      if (next) persistId(next.id)
      callbacks.current.onCartChange?.(next)
    },
    [persistId],
  )

  const requireClient = useCallback((): StorefrontClient => {
    if (!client) throw new Error('CartProvider needs a client: pass `client` or wrap it in <StorefrontProvider config|client>')
    return client
  }, [client])

  /** Queues a remote mutation with an optional optimistic layer. */
  const mutate = useCallback(
    <T,>(remote: (c: StorefrontClient) => Promise<T>, toCart: (r: T) => Cart | null, optimistic?: PendingOp['apply']): Promise<T | null> => {
      const op: PendingOp | null = optimistic ? { id: ++seqRef.current, apply: optimistic } : null
      if (op) {
        pendingRef.current = [...pendingRef.current, op]
        render()
      }
      setPending((n) => n + 1)
      const run = async (): Promise<T | null> => {
        try {
          const result = await remote(requireClient())
          const next = toCart(result)
          if (next) confirm(next)
          setError(null)
          return result
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          setError(e)
          callbacks.current.onError?.(e)
          return null
        } finally {
          if (op) pendingRef.current = pendingRef.current.filter((p) => p !== op)
          render()
          setPending((n) => n - 1)
        }
      }
      const p = queueRef.current.then(run, run)
      queueRef.current = p
      return p
    },
    [confirm, render, requireClient],
  )

  const asCart = (c: Cart) => c

  // Hydrate from the cookie / id on the client when the server did not load the cart.
  useEffect(() => {
    if (confirmedRef.current) {
      if (cookieOptions && idRef.current) writeCartCookie(idRef.current, cookieOptions)
      return
    }
    const id = idRef.current ?? (cookieOptions ? readCartCookie(cookieOptions.name ?? CART_COOKIE_NAME) : null)
    if (!id || !client) return
    idRef.current = id
    setCartId(id)
    let cancelled = false
    setLoading(true)
    client.carts
      .get(id)
      .then((loaded) => {
        if (cancelled) return
        if (loaded) confirm(loaded)
        else persistId(null)
        render()
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        callbacks.current.onError?.(e)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // Runs once on mount.
  }, [])

  const value = useMemo<CartContextValue>(() => {
    const withId = <T,>(fn: (c: StorefrontClient, id: string) => Promise<T>) => async (c: StorefrontClient) => {
      if (!idRef.current) throw new Error('No cart yet: add a line first')
      return fn(c, idRef.current)
    }
    return {
      cart,
      cartId,
      status: loading ? 'loading' : pending > 0 ? 'updating' : 'idle',
      error,
      totalQuantity: cart?.total_quantity ?? 0,
      addLines: (lines) => {
        const payload = lines.map(({ variant_id, quantity }) => ({ variant_id, quantity }))
        return mutate(
          async (c) => {
            if (!idRef.current) return c.carts.create({ lines: payload })
            try {
              return await c.carts.addLines(idRef.current, payload)
            } catch (err) {
              // Expired or unknown cart: start a new one.
              if (isNotFound(err)) return c.carts.create({ lines: payload })
              throw err
            }
          },
          asCart,
          (current) => optimisticCart.add(current, lines, currency),
        )
      },
      updateLines: (lines) => mutate(withId((c, id) => c.carts.updateLines(id, lines)), asCart, (current) => optimisticCart.update(current, lines)),
      removeLines: (lineIds) => mutate(withId((c, id) => c.carts.removeLines(id, lineIds)), asCart, (current) => optimisticCart.remove(current, lineIds)),
      setDiscountCodes: (codes) => mutate(withId((c, id) => c.carts.setDiscountCodes(id, codes)), asCart),
      setBuyer: (buyer) => mutate(withId((c, id) => c.carts.setBuyer(id, buyer)), asCart),
      setShippingAddress: (address) => mutate(withId((c, id) => c.carts.setShippingAddress(id, address)), asCart),
      setDelivery: (delivery) => mutate(withId((c, id) => c.carts.setDelivery(id, delivery)), asCart),
      deliveryOptions: () => mutate(withId((c, id) => c.carts.deliveryOptions(id)), () => null),
      refresh: () =>
        mutate(
          async (c) => (idRef.current ? c.carts.get(idRef.current) : null),
          (r) => {
            if (r === null) {
              confirmedRef.current = null
              persistId(null)
            }
            return r
          },
        ),
      clear: () => {
        confirmedRef.current = null
        pendingRef.current = []
        persistId(null)
        render()
        callbacks.current.onCartChange?.(null)
      },
    }
  }, [cart, cartId, loading, pending, error, mutate, currency, persistId, render])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

/** Cart state and actions. Throws outside `<CartProvider>`. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}

/** Cart context or `null` outside a provider. */
export function useOptionalCart(): CartContextValue | null {
  return useContext(CartContext)
}
