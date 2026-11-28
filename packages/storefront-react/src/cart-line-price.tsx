import { formatMoney, type CartLine, type Money } from '@asteby/storefront'
import type { ReactNode } from 'react'
import { useResolvedLocale } from './locale.js'

export type CartLinePriceProps = {
  line: CartLine
  /** An optimistic amount can be rendered while suppressing the previous quote's discount. */
  amount?: Money
  showDiscount?: boolean
  renderAmount?: (amount: Money) => ReactNode
  locale?: string
}

function compareAtTotal(line: CartLine): Money | null {
  const { compare_at_unit: original, unit } = line.cost
  if (!original || original.currency_code !== unit.currency_code || !(Number(original.amount) > Number(unit.amount))) {
    return null
  }
  const precision = original.amount.split('.')[1]?.length ?? 0
  return { ...original, amount: (Number(original.amount) * line.quantity).toFixed(Math.min(precision, 20)) }
}

/** The current amount always comes from the cart. Discount details are informational. */
export function CartLinePrice({ line, amount = line.cost.total, showDiscount = true, renderAmount, locale: requestedLocale }: CartLinePriceProps) {
  const locale = useResolvedLocale(requestedLocale)
  const money = renderAmount ?? ((value: Money) => formatMoney(value, locale))
  const discount = showDiscount ? line.cost.automatic_discount : undefined
  const original = showDiscount ? discount?.original_total ?? compareAtTotal(line) : null
  if (!original || original.currency_code !== amount.currency_code || !(Number(original.amount) > Number(amount.amount))) {
    return <>{money(amount)}</>
  }

  const english = locale.toLowerCase().startsWith('en')
  const label = discount?.name?.trim() || (english ? 'Automatic discount' : 'Descuento automático')
  const savings = discount?.savings
  const hasSavings = savings && savings.currency_code === amount.currency_code && Number(savings.amount) > 0
  const savingsRate = hasSavings ? Number(savings.amount) / Number(original.amount) : 0
  const percentage = savingsRate >= 0.0005 && savingsRate <= 1
    ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(savingsRate)
    : null
  return (
    <span data-sf-line-prices="">
      <del data-sf-line-original-price="">{money(original)}</del>{' '}
      <span data-sf-line-current-price="">{money(amount)}</span>
      {hasSavings ? (
        <> <span data-sf-line-automatic-discount="">{label} ({percentage && <>−{percentage} · </>}−{money(savings)})</span></>
      ) : null}
    </span>
  )
}
