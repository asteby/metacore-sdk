/** Names of the controls of the return form. The component renders them and the action reads them. */
export const RETURN_FORM = {
  intent: 'intent',
  orderId: 'order_id',
  reason: 'reason',
  notes: 'notes',
  /** `lines.<i>.sku` (hidden), `lines.<i>.selected` (checkbox), `lines.<i>.quantity` (number). */
  sku: (i: number) => `lines.${i}.sku`,
  selected: (i: number) => `lines.${i}.selected`,
  quantity: (i: number) => `lines.${i}.quantity`,
} as const
