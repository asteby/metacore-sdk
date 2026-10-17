import type { BuiltinMockupData } from '@asteby/storefront/mockup'

/** Interface words used by the built-in mockups (generic UI text, not store copy). */
export type MockupLabels = {
  /** Prefix of every accessible name, so a mockup is never announced as a photo. */
  illustration: string
  size: string
  partNumber: string
  oem: string
  fits: string
  flavor: string
  /** Unit after a numeric `servings` attribute. */
  servings: string
  lightTruck: string
  runFlat: string
}

export const DEFAULT_MOCKUP_LABELS: MockupLabels = {
  illustration: 'Ilustración de referencia',
  size: 'medida',
  partNumber: 'N.º de parte',
  oem: 'OEM',
  fits: 'Compatible con',
  flavor: 'sabor',
  servings: 'porciones',
  lightTruck: 'LT',
  runFlat: 'Run flat',
}

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase())

/** Accessible name for built-in data: "Ilustración de referencia: <title>, <key spec>". */
export function describeMockup(data: Partial<BuiltinMockupData> & { title?: string | null }, labels: MockupLabels = DEFAULT_MOCKUP_LABELS): string {
  const title = data.title ?? ''
  const parts: (string | null | undefined)[] = [title]
  switch (data.kind) {
    case 'tire':
      if (data.size && !has(title, data.size)) parts.push(`${labels.size} ${data.size}`)
      if (data.service && !has(title, data.service)) parts.push(data.service)
      break
    case 'part':
      if (data.partNumber && !has(title, data.partNumber)) parts.push(`${labels.partNumber} ${data.partNumber}`)
      break
    case 'supplement':
      if (data.flavor && !has(title, data.flavor)) parts.push(`${labels.flavor} ${data.flavor}`)
      if (data.presentation && !has(title, data.presentation)) parts.push(data.presentation)
      break
  }
  const detail = parts.filter((p): p is string => !!p).join(', ')
  return detail ? `${labels.illustration}: ${detail}` : labels.illustration
}
