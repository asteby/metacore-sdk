import type { Cart, CartLine, Money } from '@asteby/storefront'

/**
 * Cantidad optimista del cajón: mientras OPS confirma un cambio de cantidad, la fila y el subtotal se mueven de inmediato
 * en proporción a lo que OPS ya devolvió. NO es un cálculo de descuentos ni de impuestos: escala por la cantidad lo que el
 * servidor mandó (precio de la línea y subtotal) y la respuesta de OPS lo reemplaza apenas llega. Los descuentos
 * escalonados, el envío y el total se siguen leyendo solo de OPS.
 */

const decimalsOf = (amount: string) => amount.split('.')[1]?.length ?? 0

const toMinor = (m: Money) => {
  const d = decimalsOf(m.amount)
  return { minor: Math.round(Number(m.amount) * 10 ** d), digits: d }
}

const fromMinor = (minor: number, digits: number, currency: string): Money => ({
  amount: digits > 0 ? (minor / 10 ** digits).toFixed(digits) : String(Math.round(minor)),
  currency_code: currency,
})

/**
 * Cantidad máxima que se puede pedir de una línea según lo que OPS dijo que hay (`quantity_available`); `null` = no se sabe
 * o no se controla el stock: sin tope. Pedir más no tiene caso: OPS lo rechazaría.
 */
export function stockCap(line: CartLine): number | null {
  const available = (line.merchandise as { quantity_available?: number | null }).quantity_available
  return typeof available === 'number' && Number.isFinite(available) ? Math.max(0, Math.floor(available)) : null
}

/** Precio de la línea (el que muestra el cajón) para `quantity` piezas: escala el total de OPS por la cantidad. */
export function scaleLineTotal(line: CartLine, quantity: number): Money {
  const total = line.cost.total
  if (!(line.quantity > 0) || !Number.isFinite(quantity) || quantity < 0) return total
  const { minor, digits } = toMinor(total)
  return fromMinor((minor * quantity) / line.quantity, digits, total.currency_code)
}

/** Importe de la línea en la base del subtotal: con descuento (`total`) o sin él (`total + discount`). */
const lineBasis = (line: CartLine, gross: boolean): number => {
  const { minor, digits } = toMinor(line.cost.total)
  const discount = gross && line.cost.discount ? toMinor(line.cost.discount) : null
  const d = discount ? Math.max(digits, discount.digits) : digits
  const base = minor * 10 ** (d - digits)
  return base + (discount ? discount.minor * 10 ** (d - discount.digits) : 0)
}

/**
 * Subtotal para las cantidades en borrador. OPS puede mandar el subtotal antes o después del descuento de línea: se detecta
 * cuál coincide con la suma de las líneas y el cambio se mide en esa misma base. Sin borradores devuelve el de OPS tal cual.
 */
export function optimisticSubtotal(cart: Cart, drafts: Readonly<Record<string, number>>): Money {
  const subtotal = cart.cost.subtotal
  const changed = cart.lines.filter((l) => drafts[l.id] !== undefined && drafts[l.id] !== l.quantity && l.quantity > 0)
  if (changed.length === 0) return subtotal
  const { minor, digits } = toMinor(subtotal)
  const sum = (gross: boolean) => cart.lines.reduce((n, l) => n + lineBasis(l, gross) / 10 ** decimalsOf(l.cost.total.amount), 0)
  const target = minor / 10 ** digits
  const gross = Math.abs(sum(true) - target) < Math.abs(sum(false) - target)
  let delta = 0
  for (const l of changed) {
    const unit = lineBasis(l, gross) / 10 ** decimalsOf(l.cost.total.amount) / l.quantity
    delta += unit * ((drafts[l.id] as number) - l.quantity)
  }
  const next = Math.max(0, Math.round((target + delta) * 10 ** digits))
  return fromMinor(next, digits, subtotal.currency_code)
}
