import { useAuthStore } from '../stores/auth-store'
import { formatCurrency } from './currency-utils'

/**
 * Returns a currency formatter bound to the current org's currency.
 * Usage: const fmt = useFormatCurrency(); fmt(1234.56) → "$1,234.56"
 */
export function useFormatCurrency() {
  const currencyCode = useAuthStore((s) => s.auth.user?.currency_code) || 'USD'
  return (amount: number) => formatCurrency(amount, currencyCode)
}

/**
 * Non-hook version: reads currency from store snapshot.
 * Use in callbacks or outside React components.
 */
export function fmtCurrency(amount: number): string {
  const currencyCode = useAuthStore.getState().auth.user?.currency_code || 'USD'
  return formatCurrency(amount, currencyCode)
}
