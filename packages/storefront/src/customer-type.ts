/**
 * What a buyer declares they are (e.g. `taller`, `mayorista`): a short slug whose VOCABULARY belongs to each store, not
 * to the platform. It classifies the buyer for marketing and, later, price lists; choosing one never changes a price.
 * A store that does not use it sends nothing and nothing changes for it.
 *
 * Who offers which types is each ORGANIZATION'S data (its customer segments in the ERP), delivered by
 * `customer.capabilities().customer_types`; no store or SDK writes the list. Declaring one is a REQUEST: it never
 * grants prices or privileges until the organization validates it.
 */
export type CustomerType = string

const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Whether `value` is a valid type slug (lowercase letters, digits, `-` or `_`, up to 32): what OPS accepts. */
export function isCustomerType(value: unknown): value is CustomerType {
  return typeof value === 'string' && SLUG.test(value)
}

/** A type the organization lets a buyer pick: `value` is the code (what is sent as `customer_type`), `label` the text. */
export type CustomerTypeOption = {
  value: CustomerType
  label: string
  /** The organization validates this type before applying anything special to it (the buyer is told so). */
  requires_review?: boolean
}

/** `customer_types` of `GET /storefront/customer/capabilities`: the organization's own list. Absent: the store shows no select. */
export type CustomerTypes = { options: CustomerTypeOption[]; default?: CustomerType }

/** What a form needs to draw the select: clean options, the one to preselect, and whether any of them is reviewed. */
export type CustomerTypeChoices = {
  options: ReadonlyArray<CustomerTypeOption>
  defaultValue: CustomerType
  hasReview: boolean
}

const MAX_LABEL = 80

/**
 * The select's choices from the store's capabilities, or `null` when the organization offers none (the form then shows
 * nothing). Drops entries whose code is not a valid slug or whose label is empty, keeps the first of a repeated code,
 * and preselects `default` when it is one of the options (otherwise the first). Safe on older servers: no field, `null`.
 */
export function customerTypeOptions(capabilities: { customer_types?: CustomerTypes | null } | null | undefined): CustomerTypeChoices | null {
  const raw = capabilities?.customer_types
  if (!raw || !Array.isArray(raw.options)) return null
  const seen = new Set<string>()
  const options: CustomerTypeOption[] = []
  for (const o of raw.options) {
    if (!o || !isCustomerType(o.value) || seen.has(o.value)) continue
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, MAX_LABEL) : ''
    if (!label) continue
    seen.add(o.value)
    options.push({ value: o.value, label, ...(o.requires_review ? { requires_review: true } : {}) })
  }
  if (options.length === 0) return null
  const defaultValue = options.some((o) => o.value === raw.default) ? (raw.default as CustomerType) : options[0]!.value
  return { options, defaultValue, hasReview: options.some((o) => o.requires_review) }
}
