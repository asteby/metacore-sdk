/**
 * Placeholder saved as `address1` while the buyer has not typed the street yet (OPS needs a street to save an address,
 * and the live quote only needs the postal code). It is never a real address: the form shows an EMPTY street, the pay
 * button waits for a real one and the shop's server refuses it (`isPendingStreet`), even if the request is tampered with.
 */
export const PENDING_STREET = 'Por confirmar'

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** `true` when `value` is the placeholder (any case or accent) or any custom `pending` text. */
export function isPendingStreet(value: string | null | undefined, pending: string = PENDING_STREET): boolean {
  return typeof value === 'string' && norm(value) === norm(pending)
}

/** A saved address for the form's defaults: the placeholder street becomes empty. */
export function withoutPendingStreet<T extends { address1?: string | null }>(address: T | null | undefined): T | null | undefined {
  return address && isPendingStreet(address.address1) ? { ...address, address1: '' } : address
}
