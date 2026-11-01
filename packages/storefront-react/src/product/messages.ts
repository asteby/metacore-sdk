/** Texts of the product gallery (es / en). Every key can be overridden with the `messages` prop. */
const es = {
  'gallery.label': 'Imágenes de {title}',
  'gallery.roledescription': 'carrusel',
  'gallery.slide': 'Imagen {index} de {count}',
  'gallery.slide.roledescription': 'diapositiva',
  'gallery.counter': '{index} de {count}',
  'gallery.previous': 'Imagen anterior',
  'gallery.next': 'Imagen siguiente',
  'gallery.thumbnails': 'Miniaturas',
  'gallery.thumbnail': 'Ver imagen {index} de {count}',
  'gallery.empty': 'Sin imagen: {title}',
}

const en: typeof es = {
  'gallery.label': 'Images of {title}',
  'gallery.roledescription': 'carousel',
  'gallery.slide': 'Image {index} of {count}',
  'gallery.slide.roledescription': 'slide',
  'gallery.counter': '{index} of {count}',
  'gallery.previous': 'Previous image',
  'gallery.next': 'Next image',
  'gallery.thumbnails': 'Thumbnails',
  'gallery.thumbnail': 'View image {index} of {count}',
  'gallery.empty': 'No image: {title}',
}

export type ProductMessages = typeof es
export type ProductMessageKey = keyof ProductMessages

/** The messages of a locale (`en*` → English, anything else → Spanish) with the host's overrides on top. */
export function productMessages(locale: string, overrides?: Partial<ProductMessages>): ProductMessages {
  const base = /^en\b/i.test(locale) ? en : es
  return overrides ? { ...base, ...overrides } : base
}

export function fillProductText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))
}
