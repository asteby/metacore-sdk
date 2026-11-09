/** What a postal-code lookup answers. Same shape as `PostalCodeInfo` of `@asteby/storefront-react/checkout`. */
export type PostalInfo = {
  province?: string | null
  city?: string | null
  neighborhoods?: readonly string[] | null
  /** Every municipality the code covers, when more than one (the buyer chooses; nothing is locked). */
  cities?: readonly string[] | null
}
