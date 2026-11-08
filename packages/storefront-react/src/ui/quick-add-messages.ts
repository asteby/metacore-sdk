/**
 * Texts of `QuickAddDialog`. Spanish (es-MX) by default, English with `en*`; every text can be overridden with `messages`
 * (a partial map), so a store never needs its own copy. `{n}` and `{name}` are replaced.
 */
const ES = {
  'quickadd.eyebrow': 'Elige tu presentación',
  'quickadd.close': 'Cerrar',
  'quickadd.options': 'Presentación',
  'quickadd.soldOut': 'Agotado',
  'quickadd.selected': 'Seleccionado',
  'quickadd.quantity': 'Cantidad',
  'quickadd.decrease': 'Disminuir cantidad',
  'quickadd.increase': 'Aumentar cantidad',
  'quickadd.maxReached': 'Es el máximo disponible.',
  'quickadd.lowStock': 'Quedan {n} disponibles',
  'quickadd.inStock': 'Disponible',
  'quickadd.add': 'Agregar al carrito',
  'quickadd.adding': 'Agregando…',
  'quickadd.viewProduct': 'Ver producto completo',
  'quickadd.viewProductAria': 'Ver producto completo: {name}',
  'quickadd.pick': 'Elige una presentación para continuar.',
  'quickadd.from': 'Desde',
} as const

export type QuickAddMessageKey = keyof typeof ES
export type QuickAddMessages = Record<QuickAddMessageKey, string>

const EN: QuickAddMessages = {
  'quickadd.eyebrow': 'Choose your option',
  'quickadd.close': 'Close',
  'quickadd.options': 'Option',
  'quickadd.soldOut': 'Sold out',
  'quickadd.selected': 'Selected',
  'quickadd.quantity': 'Quantity',
  'quickadd.decrease': 'Decrease quantity',
  'quickadd.increase': 'Increase quantity',
  'quickadd.maxReached': 'That is the maximum available.',
  'quickadd.lowStock': 'Only {n} left',
  'quickadd.inStock': 'In stock',
  'quickadd.add': 'Add to cart',
  'quickadd.adding': 'Adding…',
  'quickadd.viewProduct': 'View full product',
  'quickadd.viewProductAria': 'View full product: {name}',
  'quickadd.pick': 'Choose an option to continue.',
  'quickadd.from': 'From',
}

export function quickAddMessages(locale?: string | null, overrides?: Partial<QuickAddMessages> | null): QuickAddMessages {
  const base: QuickAddMessages = (locale ?? 'es').toLowerCase().startsWith('en') ? EN : { ...ES }
  return overrides ? { ...base, ...overrides } : base
}

export function fillMessage(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
