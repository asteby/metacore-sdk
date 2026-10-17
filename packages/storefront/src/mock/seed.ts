import type {
  Article,
  Collection,
  Customer,
  Image,
  Location,
  Menu,
  Page,
  Product,
  ProductOption,
  ProductVariant,
  Shop,
  Theme,
} from '../types.js'

/**
 * Placeholder image source for all seed data. Swap it (or pass `imageUrl` to
 * `createMockStorefront`) to use your own assets.
 */
export const MOCK_IMAGE_URL = (seed: string, width = 800, height = 800): string =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`

export type MockImageUrl = typeof MOCK_IMAGE_URL

export const MOCK_CURRENCY = 'MXN'

/** Seed customer that already exists (log in with OTP `000000`). */
export const MOCK_CUSTOMER_EMAIL = 'cliente@example.com'

type ProductSpec = {
  handle: string
  title: string
  collection: string
  type: string
  vendor: string
  price: number
  compareAt?: number
  options?: ProductOption[]
  tags?: string[]
  attributes?: Product['attributes']
  /** Stock per variant index (default 12). */
  stock?: number | ((index: number, opts: Record<string, string>) => number)
  /** Extra price per option value, e.g. `{ XL: 50 }`. */
  priceDelta?: Record<string, number>
  description: string
}

const OPT = {
  size: (values = ['S', 'M', 'L']): ProductOption => ({ name: 'Talla', values }),
  color: (values: string[]): ProductOption => ({ name: 'Color', values }),
}

export const COLLECTION_SPECS: { handle: string; title: string; description: string; parent?: string }[] = [
  { handle: 'ropa', title: 'Ropa', description: 'Prendas básicas para todos los días.' },
  { handle: 'hogar', title: 'Hogar', description: 'Objetos útiles y bonitos para tu casa.' },
  { handle: 'accesorios', title: 'Accesorios', description: 'Complementos para llevar contigo.' },
  { handle: 'llantas', title: 'Llantas', description: 'Llantas para auto por medida.' },
]

const tire = (width: number, aspect: number, rim: number) => ({
  width,
  aspect,
  rim,
  size_key: `${width}/${aspect}R${rim}`,
})

export const PRODUCT_SPECS: ProductSpec[] = [
  // Ropa
  { handle: 'playera-basica', title: 'Playera básica', collection: 'ropa', type: 'Playera', vendor: 'Casa Textil', price: 249, compareAt: 299, options: [OPT.size(), OPT.color(['Blanco', 'Negro'])], tags: ['algodón', 'nuevo'], stock: (i) => (i === 5 ? 0 : 15), description: 'Playera de algodón peinado, corte recto.' },
  { handle: 'sudadera-capucha', title: 'Sudadera con capucha', collection: 'ropa', type: 'Sudadera', vendor: 'Casa Textil', price: 699, options: [OPT.size(['S', 'M', 'L', 'XL']), OPT.color(['Gris', 'Azul'])], priceDelta: { XL: 50 }, tags: ['invierno'], description: 'Sudadera afelpada con bolsa canguro.' },
  { handle: 'pantalon-chino', title: 'Pantalón chino', collection: 'ropa', type: 'Pantalón', vendor: 'Taller Urbano', price: 899, options: [OPT.size(['28', '30', '32', '34'])], stock: (i) => (i === 0 ? 0 : 6), description: 'Pantalón de gabardina con un toque de elasticidad.' },
  { handle: 'chamarra-ligera', title: 'Chamarra ligera', collection: 'ropa', type: 'Chamarra', vendor: 'Taller Urbano', price: 1299, compareAt: 1599, options: [OPT.size()], tags: ['oferta'], description: 'Chamarra rompevientos plegable.' },
  { handle: 'gorra-clasica', title: 'Gorra clásica', collection: 'ropa', type: 'Gorra', vendor: 'Casa Textil', price: 199, options: [OPT.color(['Negro', 'Beige', 'Verde'])], description: 'Gorra de seis paneles con ajuste trasero.' },
  { handle: 'calcetines-paquete', title: 'Calcetines (paquete de 3)', collection: 'ropa', type: 'Calcetines', vendor: 'Casa Textil', price: 149, stock: 0, description: 'Tres pares de calcetines de algodón.' },
  // Hogar
  { handle: 'taza-ceramica', title: 'Taza de cerámica', collection: 'hogar', type: 'Cocina', vendor: 'Barro Vivo', price: 129, options: [OPT.color(['Blanco', 'Terracota'])], tags: ['regalo'], description: 'Taza de 350 ml hecha a mano.' },
  { handle: 'lampara-mesa', title: 'Lámpara de mesa', collection: 'hogar', type: 'Iluminación', vendor: 'Luz Serena', price: 1199, description: 'Lámpara con pantalla de lino y base de madera.' },
  { handle: 'cojin-decorativo', title: 'Cojín decorativo', collection: 'hogar', type: 'Textil', vendor: 'Casa Textil', price: 349, compareAt: 399, options: [OPT.color(['Mostaza', 'Verde', 'Gris'])], description: 'Cojín de 45 × 45 cm con funda removible.' },
  { handle: 'set-sartenes', title: 'Set de sartenes', collection: 'hogar', type: 'Cocina', vendor: 'Cocina Diaria', price: 1899, compareAt: 2299, tags: ['oferta'], description: 'Tres sartenes antiadherentes de 20, 24 y 28 cm.' },
  { handle: 'manta-tejida', title: 'Manta tejida', collection: 'hogar', type: 'Textil', vendor: 'Casa Textil', price: 799, description: 'Manta de punto grueso, 130 × 170 cm.' },
  { handle: 'maceta-barro', title: 'Maceta de barro', collection: 'hogar', type: 'Jardín', vendor: 'Barro Vivo', price: 189, options: [{ name: 'Tamaño', values: ['Chica', 'Mediana', 'Grande'] }], priceDelta: { Mediana: 60, Grande: 140 }, description: 'Maceta de barro natural con plato.' },
  // Accesorios
  { handle: 'mochila-diaria', title: 'Mochila diaria', collection: 'accesorios', type: 'Mochila', vendor: 'Ruta Libre', price: 999, options: [OPT.color(['Negro', 'Azul'])], tags: ['nuevo'], description: 'Mochila de 20 L con compartimento para laptop.' },
  { handle: 'botella-termica', title: 'Botella térmica', collection: 'accesorios', type: 'Botella', vendor: 'Ruta Libre', price: 399, options: [{ name: 'Capacidad', values: ['500 ml', '750 ml'] }], priceDelta: { '750 ml': 80 }, description: 'Mantiene frío 24 h y caliente 12 h.' },
  { handle: 'lentes-sol', title: 'Lentes de sol', collection: 'accesorios', type: 'Lentes', vendor: 'Vista Clara', price: 599, compareAt: 749, description: 'Lentes polarizados con protección UV400.' },
  { handle: 'reloj-analogico', title: 'Reloj analógico', collection: 'accesorios', type: 'Reloj', vendor: 'Vista Clara', price: 1499, description: 'Reloj con correa de piel y cristal mineral.' },
  { handle: 'cartera-piel', title: 'Cartera de piel', collection: 'accesorios', type: 'Cartera', vendor: 'Taller Urbano', price: 549, options: [OPT.color(['Café', 'Negro'])], description: 'Cartera delgada con seis ranuras.' },
  { handle: 'paraguas-compacto', title: 'Paraguas compacto', collection: 'accesorios', type: 'Paraguas', vendor: 'Ruta Libre', price: 299, stock: 3, description: 'Paraguas plegable resistente al viento.' },
  // Llantas (exercise attribute facets)
  { handle: 'llanta-205-55-r16-touring', title: 'Llanta 205/55 R16 Touring', collection: 'llantas', type: 'Llanta', vendor: 'Marca Norte', price: 1899, compareAt: 2099, attributes: { ...tire(205, 55, 16), load_index: 91, speed_rating: 'V', runflat: false }, tags: ['auto'], description: 'Llanta de turismo silenciosa y de bajo consumo.' },
  { handle: 'llanta-205-55-r16-sport', title: 'Llanta 205/55 R16 Sport', collection: 'llantas', type: 'Llanta', vendor: 'Marca Sur', price: 2199, attributes: { ...tire(205, 55, 16), load_index: 94, speed_rating: 'W', runflat: false }, tags: ['auto'], description: 'Agarre deportivo en seco y mojado.' },
  { handle: 'llanta-195-65-r15-eco', title: 'Llanta 195/65 R15 Eco', collection: 'llantas', type: 'Llanta', vendor: 'Marca Norte', price: 1499, attributes: { ...tire(195, 65, 15), load_index: 91, speed_rating: 'H', runflat: false }, tags: ['auto'], description: 'Baja resistencia al rodamiento.' },
  { handle: 'llanta-225-45-r17-runflat', title: 'Llanta 225/45 R17 Run Flat', collection: 'llantas', type: 'Llanta', vendor: 'Marca Centro', price: 3299, attributes: { ...tire(225, 45, 17), load_index: 91, speed_rating: 'W', runflat: true }, tags: ['auto'], stock: 2, description: 'Permite rodar hasta 80 km sin presión.' },
  { handle: 'llanta-265-70-r16-at', title: 'Llanta 265/70 R16 All Terrain', collection: 'llantas', type: 'Llanta', vendor: 'Marca Sur', price: 3599, attributes: { ...tire(265, 70, 16), load_index: 112, speed_rating: 'T', runflat: false }, tags: ['camioneta'], description: 'Para camioneta, asfalto y terracería.' },
  { handle: 'llanta-175-70-r13-city', title: 'Llanta 175/70 R13 City', collection: 'llantas', type: 'Llanta', vendor: 'Marca Centro', price: 999, attributes: { ...tire(175, 70, 13), load_index: 82, speed_rating: 'T', runflat: false }, tags: ['auto'], stock: 0, description: 'Económica y durable para ciudad.' },
]

const money = (n: number, currency: string) => ({ amount: n.toFixed(2), currency_code: currency })

function cartesian(options: ProductOption[]): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}]
  for (const opt of options) {
    const next: Record<string, string>[] = []
    for (const c of combos) for (const v of opt.values) next.push({ ...c, [opt.name]: v })
    combos = next
  }
  return combos
}

const BASE_DATE = Date.UTC(2026, 8, 30, 12, 0, 0)

function image(url: MockImageUrl, seed: string, alt: string): Image {
  return { url: url(seed), alt, width: 800, height: 800 }
}

export function buildProducts(currency: string, imageUrl: MockImageUrl = MOCK_IMAGE_URL): Product[] {
  return PRODUCT_SPECS.map((spec, pi) => {
    const options = spec.options ?? []
    const combos = options.length ? cartesian(options) : [{}]
    const images = [image(imageUrl, spec.handle, spec.title), image(imageUrl, `${spec.handle}-2`, `${spec.title}, detalle`)]
    const variants: ProductVariant[] = combos.map((opts, vi) => {
      const delta = Object.values(opts).reduce((sum, v) => sum + (spec.priceDelta?.[v] ?? 0), 0)
      const price = spec.price + delta
      const stock = typeof spec.stock === 'function' ? spec.stock(vi, opts) : (spec.stock ?? 12)
      const title = Object.values(opts).join(' / ') || 'Predeterminado'
      const firstValue = Object.values(opts)[0]
      return {
        id: `var_${pi + 1}_${vi + 1}`,
        sku: `${spec.handle.toUpperCase().replace(/-/g, '')}-${vi + 1}`.slice(0, 32),
        title,
        selected_options: Object.entries(opts).map(([name, value]) => ({ name, value })),
        price: money(price, currency),
        compare_at_price: spec.compareAt ? money(spec.compareAt + delta, currency) : null,
        available_for_sale: stock > 0,
        quantity_available: stock,
        image: firstValue ? image(imageUrl, `${spec.handle}-${firstValue}`, `${spec.title} ${firstValue}`) : null,
        barcode: `75000000${String(pi * 100 + vi).padStart(5, '0')}`,
      }
    })
    const prices = variants.map((v) => Number(v.price.amount))
    const compares = variants.map((v) => (v.compare_at_price ? Number(v.compare_at_price.amount) : null)).filter((n): n is number => n !== null)
    const collection = COLLECTION_SPECS.find((c) => c.handle === spec.collection)!
    return {
      id: `prod_${pi + 1}`,
      handle: spec.handle,
      title: spec.title,
      description: spec.description,
      description_html: `<p>${spec.description}</p>`,
      vendor: spec.vendor,
      product_type: spec.type,
      category: { id: `cat_${spec.collection}`, handle: collection.handle, title: collection.title },
      tags: spec.tags ?? [],
      attributes: spec.attributes ?? {},
      featured_image: images[0] ?? null,
      images,
      options,
      variants,
      price_range: { min: money(Math.min(...prices), currency), max: money(Math.max(...prices), currency) },
      compare_at_price_range: compares.length
        ? { min: money(Math.min(...compares), currency), max: money(Math.max(...compares), currency) }
        : null,
      available_for_sale: variants.some((v) => v.available_for_sale),
      seo: { title: `${spec.title} | Mi tienda`, description: spec.description },
      updated_at: new Date(BASE_DATE - pi * 86_400_000).toISOString(),
    }
  })
}

/** Product handle → collection handles. */
export function buildMemberships(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const p of PRODUCT_SPECS) out[p.handle] = [p.collection]
  return out
}

export function buildCollections(imageUrl: MockImageUrl = MOCK_IMAGE_URL): Collection[] {
  return COLLECTION_SPECS.map((c) => ({
    id: `col_${c.handle}`,
    handle: c.handle,
    title: c.title,
    description: c.description,
    image: image(imageUrl, `col-${c.handle}`, c.title),
    seo: { title: `${c.title} | Mi tienda`, description: c.description },
    parent_handle: c.parent ?? null,
  }))
}

const MX_TZ = 'America/Mexico_City'
const weekdays = (open: string, close: string, days = [1, 2, 3, 4, 5]) => days.map((day) => ({ day, open, close }))

/** Three example branches (CDMX, Monterrey, Guadalajara) with structured hours. */
export function buildLocations(currency: string): Location[] {
  const contacts = (phone: string | null) => ({ phone, email: null, whatsapp: null })
  return [
    {
      id: 'br_centro', name: 'Sucursal Centro', kind: 'store', address: 'Av. Principal 100, Col. Centro', city: 'Ciudad de México', postal_code: '06000',
      phone: '+52 55 0000 0001', lat: 19.4326, lng: -99.1332, timezone: MX_TZ,
      hours: 'Mo-Fr 09:00-19:00, Sa 09:00-14:00', opening_hours_text: 'Lun–Vie 9:00–19:00 · Sáb 9:00–14:00',
      opening_hours: { weekly: [...weekdays('09:00', '19:00'), { day: 6, open: '09:00', close: '14:00' }] },
      services: ['pickup', 'returns'], contacts: contacts('+52 55 0000 0001'),
      pickup: { enabled: true, fee: null, prep_days: 0 },
    },
    {
      id: 'br_norte', name: 'Sucursal Norte', kind: 'store', address: 'Calle Secundaria 25, Col. Norte', city: 'Monterrey', postal_code: '64000',
      phone: null, lat: 25.6866, lng: -100.3161, timezone: MX_TZ,
      hours: 'Mo-Sa 10:00-18:00', opening_hours_text: 'Lun–Sáb 10:00–18:00',
      opening_hours: { weekly: weekdays('10:00', '18:00', [1, 2, 3, 4, 5, 6]) },
      services: ['pickup'], contacts: contacts(null),
      pickup: { enabled: true, fee: money(30, currency), prep_days: 1 },
    },
    {
      id: 'br_occidente', name: 'Punto de recolección Occidente', kind: 'pickup_point', address: 'Av. Vallarta 1500, Col. Americana', city: 'Guadalajara', postal_code: '44100',
      phone: '+52 33 0000 0003', lat: 20.6736, lng: -103.3897, timezone: MX_TZ,
      hours: 'Mo-Fr 11:00-20:00', opening_hours_text: 'Lun–Vie 11:00–20:00',
      opening_hours: { weekly: weekdays('11:00', '20:00') },
      services: ['pickup'], contacts: contacts('+52 33 0000 0003'),
      pickup: { enabled: false, fee: null, prep_days: 2 },
    },
  ]
}

/** Postal-code centroids the mock can resolve (the real API resolves any Mexican CP). */
export const MOCK_POSTAL_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  '06000': { lat: 19.4326, lng: -99.1332 },
  '64000': { lat: 25.6714, lng: -100.309 },
  '44100': { lat: 20.6767, lng: -103.3475 },
  '03100': { lat: 19.3885, lng: -99.1719 },
}

export function buildShop(currency: string, imageUrl: MockImageUrl = MOCK_IMAGE_URL): Shop {
  return {
    name: 'Mi tienda',
    description: 'Tienda de ejemplo para desarrollar sin backend.',
    domain: 'mi-tienda.example',
    currency_code: currency,
    locale: 'es-MX',
    locales: ['es-MX', 'en-US'],
    country_code: 'MX',
    logo: { url: imageUrl('logo', 256, 256), alt: 'Mi tienda', width: 256, height: 256 },
    contact: { email: 'hola@mi-tienda.example', phone: '+52 55 0000 0000', whatsapp: '+5215500000000' },
    branches: buildLocations(currency),
    policies: { free_shipping_min: money(999, currency), returns_days: 30 },
  }
}

export function buildTheme(): Theme {
  return {
    tokens: {
      background: '#ffffff',
      foreground: '#111827',
      primary: '#0f766e',
      'primary-foreground': '#ffffff',
      secondary: '#f1f5f9',
      'secondary-foreground': '#0f172a',
      muted: '#f8fafc',
      'muted-foreground': '#64748b',
      accent: '#f59e0b',
      'accent-foreground': '#111827',
      border: '#e2e8f0',
      destructive: '#dc2626',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    radius: '0.5rem',
  }
}

export function buildPages(imageUrl: MockImageUrl = MOCK_IMAGE_URL): Page[] {
  return [
    {
      handle: 'home',
      title: 'Inicio',
      seo: { title: 'Mi tienda', description: 'Ropa, hogar, accesorios y llantas con envío a todo el país.' },
      sections: [
        { id: 'hero-1', type: 'hero', props: { title: 'Todo lo que necesitas, en un solo lugar', subtitle: 'Envío gratis desde $999', cta_label: 'Ver productos', cta_url: '/collections/ropa', image: imageUrl('hero', 1600, 700) } },
        { id: 'grid-1', type: 'product_grid', props: { title: 'Lo más nuevo', collection: 'ropa', limit: 8 } },
        { id: 'collections-1', type: 'collection_list', props: { title: 'Compra por categoría', handles: ['ropa', 'hogar', 'accesorios', 'llantas'] } },
        { id: 'text-1', type: 'rich_text', props: { title: 'Sobre nosotros', html: '<p>Somos una tienda de ejemplo. Edita este texto desde el panel.</p>' } },
        {
          id: 'faq-1',
          type: 'faq',
          props: {
            title: 'Preguntas frecuentes',
            items: [
              { question: '¿Cuánto tarda el envío?', answer: 'De 2 a 5 días hábiles.' },
              { question: '¿Puedo recoger en tienda?', answer: 'Sí, elige recoger en sucursal al pagar.' },
              { question: '¿Cómo pido factura?', answer: 'Desde tu cuenta, en el detalle del pedido.' },
            ],
          },
        },
      ],
    },
    legal('terminos', 'Términos y condiciones', 'Al comprar en Mi tienda aceptas estos términos.'),
    legal('privacidad', 'Aviso de privacidad', 'Tratamos tus datos solo para procesar tus pedidos.'),
    legal('devoluciones', 'Política de devoluciones', 'Tienes 30 días para devolver tu compra.'),
  ]
}

function legal(handle: string, title: string, body: string): Page {
  return {
    handle,
    title,
    seo: { title: `${title} | Mi tienda`, description: body },
    sections: [{ id: `${handle}-text`, type: 'rich_text', props: { title, html: `<p>${body}</p>` } }],
  }
}

export function buildMenus(): Menu[] {
  return [
    {
      handle: 'main',
      items: [
        { title: 'Inicio', url: '/' },
        {
          title: 'Tienda',
          url: '/search',
          items: COLLECTION_SPECS.map((c) => ({ title: c.title, url: `/collections/${c.handle}` })),
        },
        { title: 'Blog', url: '/blogs/noticias' },
      ],
    },
    {
      handle: 'footer',
      items: [
        { title: 'Términos y condiciones', url: '/pages/terminos' },
        { title: 'Aviso de privacidad', url: '/pages/privacidad' },
        { title: 'Devoluciones', url: '/pages/devoluciones' },
      ],
    },
  ]
}

export function buildArticles(imageUrl: MockImageUrl = MOCK_IMAGE_URL): Article[] {
  return [
    {
      id: 'art_1',
      handle: 'como-elegir-llantas',
      title: 'Cómo elegir las llantas correctas',
      excerpt: 'Lee la medida en el costado de tu llanta: ancho, perfil y rin.',
      content_html: '<p>La medida 205/55 R16 indica 205 mm de ancho, perfil del 55 % y rin de 16 pulgadas.</p>',
      image: image(imageUrl, 'blog-llantas', 'Llantas'),
      author: 'Equipo Mi tienda',
      tags: ['llantas', 'guías'],
      published_at: '2026-09-15T15:00:00.000Z',
      seo: { title: 'Cómo elegir llantas | Mi tienda', description: 'Guía rápida para leer la medida de tus llantas.' },
    },
    {
      id: 'art_2',
      handle: 'cuidado-prendas-algodon',
      title: 'Cuida tus prendas de algodón',
      excerpt: 'Tres consejos para que tus playeras duren más.',
      content_html: '<p>Lava en frío, seca a la sombra y plancha al revés.</p>',
      image: image(imageUrl, 'blog-algodon', 'Prendas de algodón'),
      author: 'Equipo Mi tienda',
      tags: ['ropa', 'guías'],
      published_at: '2026-09-01T15:00:00.000Z',
      seo: { title: 'Cuida tus prendas | Mi tienda', description: 'Consejos de lavado para prendas de algodón.' },
    },
  ]
}

export function buildCustomers(): Customer[] {
  return [
    {
      id: 'cus_1',
      email: MOCK_CUSTOMER_EMAIL,
      phone: '+525500000002',
      first_name: 'Cliente',
      last_name: 'Demo',
      default_address_id: null,
      created_at: '2026-01-10T12:00:00.000Z',
    },
  ]
}
