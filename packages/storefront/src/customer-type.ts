/**
 * What a buyer declares they are, for the store's marketing and (later) price lists. A manual classification:
 * choosing a type does not change prices. Empty or absent on the server reads as `final`.
 */
export const CUSTOMER_TYPES = ['final', 'refaccionario', 'taller', 'flotillas'] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]
export const DEFAULT_CUSTOMER_TYPE: CustomerType = 'final'

export function isCustomerType(value: unknown): value is CustomerType {
  return typeof value === 'string' && (CUSTOMER_TYPES as readonly string[]).includes(value)
}
