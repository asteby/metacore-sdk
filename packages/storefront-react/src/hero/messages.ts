/** Texts of the hero slider (es / en). Every key can be overridden with the `messages` prop. */
const es = {
  'hero.label': 'Campañas',
  'hero.roledescription': 'carrusel',
  'hero.slide.roledescription': 'diapositiva',
  'hero.slide': 'Diapositiva {index} de {count}',
  'hero.previous': 'Diapositiva anterior',
  'hero.next': 'Diapositiva siguiente',
  'hero.pause': 'Pausar el carrusel',
  'hero.play': 'Reanudar el carrusel',
}

const en: typeof es = {
  'hero.label': 'Campaigns',
  'hero.roledescription': 'carousel',
  'hero.slide.roledescription': 'slide',
  'hero.slide': 'Slide {index} of {count}',
  'hero.previous': 'Previous slide',
  'hero.next': 'Next slide',
  'hero.pause': 'Pause the carousel',
  'hero.play': 'Resume the carousel',
}

export type HeroMessages = typeof es
export type HeroMessageKey = keyof HeroMessages

/** The messages of a locale (`en*` → English, anything else → Spanish) with the host's overrides on top. */
export function heroMessages(locale: string, overrides?: Partial<HeroMessages>): HeroMessages {
  const base = /^en\b/i.test(locale) ? en : es
  return overrides ? { ...base, ...overrides } : base
}

export function fillHeroText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))
}
