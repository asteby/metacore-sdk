/**
 * What a buyer declares they are (e.g. `taller`, `mayorista`): a short slug whose VOCABULARY belongs to each store, not
 * to the platform. It classifies the buyer for marketing and, later, price lists; choosing one never changes a price.
 * A store that does not use it sends nothing and nothing changes for it.
 */
export type CustomerType = string

const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Whether `value` is a valid type slug (lowercase letters, digits, `-` or `_`, up to 32): what OPS accepts. */
export function isCustomerType(value: unknown): value is CustomerType {
  return typeof value === 'string' && SLUG.test(value)
}
