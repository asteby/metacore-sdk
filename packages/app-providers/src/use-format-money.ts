// useFormatMoney — presentation formatter bound to the org's currency/locale.
//
// Reads `useOrgConfig()`; there are NO regional defaults (no 'MXN', no
// 'es-MX'):
//   • org has a currency  → Intl currency format with that currency's own
//     minor units (JPY 0, USD 2, KWD 3).
//   • org has NO currency → plain localized number, no symbol (never a
//     guessed currency). Pass `{ currency }` to override per call.
//   • org has NO locale   → the runtime's default locale.
// Presentation only: arithmetic/rounding belongs to `MoneyValue` and the
// backend's moneykit.
import { useCallback } from 'react'
import { formatAmount, type FormatAmountOptions } from '@asteby/metacore-lib'
import { useOrgConfig } from './org-config-provider'

export type FormatMoneyOverrides = Omit<FormatAmountOptions, 'locale'> & { locale?: string }

export type FormatMoney = (
  amount: number | string | null | undefined,
  overrides?: FormatMoneyOverrides,
) => string

export function useFormatMoney(): FormatMoney {
  const { config } = useOrgConfig()
  const { currency, locale } = config
  return useCallback<FormatMoney>(
    (amount, overrides) =>
      formatAmount(amount, {
        currency: overrides?.currency ?? currency,
        locale: overrides?.locale ?? locale,
        display: overrides?.display,
        fractionDigits: overrides?.fractionDigits,
      }),
    [currency, locale],
  )
}
