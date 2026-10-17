/**
 * Parity fixtures: products (and labels) whose mockups were rendered with the
 * hand-written JSX components (before they became specs) and frozen in
 * `legacy-golden.json`. `parity.test.tsx` renders the same fixtures with the
 * spec interpreter and compares the normalized DOM.
 */
import type { MockupLabels } from '../labels.js'
import type { ProductImageProduct } from '../product-image.js'

export type ParityFixture = {
  name: string
  product: ProductImageProduct
  variant?: { selected_options?: { name: string; value: string }[]; image?: null }
  kind?: string
  alt?: string
  labels?: Partial<MockupLabels>
}

const p = (x: Partial<ProductImageProduct> & { title: string }): ProductImageProduct => ({ tags: [], attributes: {}, featured_image: null, ...x })

export const PARITY_FIXTURES: ParityFixture[] = [
  // tire
  { name: 'tire/full', product: p({ title: 'Llanta Touring', vendor: 'Marca Norte', product_type: 'Llanta', attributes: { size_key: '205/55R16', section_width_mm: 205, aspect_ratio: 55, rim_diameter_in: 16, load_index: 91, speed_rating: 'V', model: 'Eco Touring' } }) },
  { name: 'tire/split-only', product: p({ title: 'Llanta 185/65R15', product_type: 'Llanta', attributes: { section_width_mm: '185', aspect_ratio: '65', rim_diameter_in: '15' } }) },
  { name: 'tire/written-size', product: p({ title: 'Llanta camioneta', vendor: 'Rueda', product_type: 'Neumático', attributes: { size: 'LT265/70R17', load_service: '121/118S', light_truck: true, model: 'All Terrain AT3' } }) },
  { name: 'tire/lt-split', product: p({ title: 'Llanta LT', product_type: 'Llanta', attributes: { size_key: 'LT245/75R16', section_width_mm: 245, aspect_ratio: 75, rim_diameter_in: 16, lt: 'sí', runflat: 'yes', speed_rating: 'R', load_index: '120/116' } }) },
  { name: 'tire/bare', product: p({ title: 'Llanta', product_type: 'Llanta' }) },
  { name: 'tire/model-only', product: p({ title: 'Llanta de invierno para camioneta con nombre muy largo', vendor: 'Marca', tags: ['llantas'], attributes: { model: 'Nieve Total Plus Extreme Grip Edition' } }) },
  { name: 'tire/service-only', product: p({ title: 'Llanta', product_type: 'Llanta', attributes: { load_index: 91, speed_rating: 'H' } }) },
  { name: 'tire/decimal-rim', product: p({ title: 'Llanta 12.5', product_type: 'Llanta', attributes: { section_width_mm: 31, aspect_ratio: 10.5, rim_diameter_in: 15 , runflat: true } }) },
  { name: 'tire/english-labels', product: p({ title: 'Touring tire', vendor: 'North', product_type: 'Tire', attributes: { size_key: '205/55R16', light_truck: true, run_flat: 'true', speed_rating: 'V', load_index: 91 } }), labels: { illustration: 'Illustration', size: 'size', lightTruck: 'LT', runFlat: 'Run-flat' } },
  { name: 'tire/decorative', product: p({ title: 'Llanta', product_type: 'Llanta', attributes: { size_key: '205/55R16' } }), alt: '' },
  { name: 'tire/alt', product: p({ title: 'Llanta', product_type: 'Llanta', attributes: { size_key: '205/55R16' } }), alt: 'Llanta deportiva' },
  // part
  { name: 'part/full', product: p({ title: 'Balatas delanteras cerámicas', vendor: 'Marca', tags: ['refacciones'], category: { title: 'Frenos', handle: 'frenos' } as never, attributes: { part_number: 'BD-1234', oem_number: '04465-02220', fitment: 'Versa 2012–2019', position: 'Delantera' } }) },
  { name: 'part/oem-only', product: p({ title: 'Filtro de aceite', product_type: 'Refacción', attributes: { oem_number: '15208-65F0E' } }) },
  { name: 'part/no-number', product: p({ title: 'Bomba de agua para motor de cuatro cilindros', product_type: 'Autopartes', category: { title: 'Enfriamiento', handle: 'enfriamiento' } as never }) },
  { name: 'part/no-brand-position', product: p({ title: 'Amortiguador', category: { title: 'Suspensión', handle: 'suspension' } as never, attributes: { mpn: 'AM-77', part_number: 'AM-77', posicion: 'Trasera izquierda' } }) },
  { name: 'part/long-fitment', product: p({ title: 'Juego de balatas cerámicas de alto desempeño para uso rudo', vendor: 'Frenos del Norte Internacional', tags: ['refacciones'], attributes: { part_number: 'XYZ-9988776655-ABC', oem_number: 'OEM-1', fitment: 'Nissan Versa 2012–2019, Nissan March 2011–2020, Nissan Note 2014–2019, Renault Logan 2015–2020 y más' } }) },
  { name: 'part/brand-only', product: p({ title: 'Banda', vendor: 'Gates', product_type: 'Refacción' }) },
  // supplement
  { name: 'supplement/tub', product: p({ title: 'Proteína de suero', vendor: 'Marca', product_type: 'Proteína', attributes: { presentation: '2 lb' }, options: [{ name: 'Sabor', values: ['Chocolate', 'Vainilla'] }] }) },
  { name: 'supplement/tub-selected', product: p({ title: 'Proteína de suero', vendor: 'Marca', product_type: 'Proteína', attributes: { presentation: '2 lb' }, options: [{ name: 'Sabor', values: ['Chocolate', 'Vainilla'] }] }), variant: { selected_options: [{ name: 'Sabor', value: 'Chocolate' }], image: null } },
  { name: 'supplement/bottle', product: p({ title: 'Omega 3 ultra', product_type: 'Vitaminas', attributes: { container: 'Frasco', servings: 60 } }) },
  { name: 'supplement/capsules', product: p({ title: 'Multivitamínico', vendor: 'Vital', tags: ['suplementos'], attributes: { form: '120 cápsulas', flavor: 'Natural' } }) },
  { name: 'supplement/bag', product: p({ title: 'Creatina monohidratada micronizada pura', vendor: 'GN', product_type: 'Creatina', attributes: { envase: 'Doypack', net_content: '500 g' }, options: [{ name: 'Sabor', values: ['Sin sabor'] }] }) },
  { name: 'supplement/option-presentation', product: p({ title: 'Whey', product_type: 'Whey', options: [{ name: 'Presentación', values: ['5 lb'] }, { name: 'flavour', values: ['Fresa'] }] }), variant: { selected_options: [{ name: 'Presentación', value: '2 lb' }] } },
  { name: 'supplement/bare', product: p({ title: 'Pre-entreno', product_type: 'Pre-entreno' }) },
  { name: 'supplement/long', product: p({ title: 'Superproteínaconnombreextremadamentelargo isolatada hidrolizada premium', vendor: 'Marca con nombre largo', product_type: 'Proteína', attributes: { sabor: 'Galleta con crema y chispas de chocolate', presentacion: '2.27 kg (5 libras exactas)' } }) },
  { name: 'supplement/english', product: p({ title: 'Whey protein', vendor: 'Brand', product_type: 'Supplement', attributes: { servings: '30' } }), labels: { illustration: 'Illustration', flavor: 'flavor', servings: 'servings' } },
  // generic
  { name: 'generic/plain', product: p({ title: 'Paraguas compacto', vendor: 'Ruta Libre', product_type: 'Paraguas' }) },
  { name: 'generic/long', product: p({ title: 'Paraguas compacto automático con apertura y cierre de un toque', product_type: 'Paraguas' }) },
  { name: 'generic/category', product: p({ title: 'Casa Textil', category: { title: 'Hogar y decoración', handle: 'hogar' } as never }) },
  { name: 'generic/single-word', product: p({ title: 'Lámpara', vendor: 'Luz' }) },
  { name: 'generic/emoji', product: p({ title: '💡 Idea', vendor: 'X'.repeat(40) }) },
  { name: 'generic/forced-from-tire', product: p({ title: 'Llanta', product_type: 'Llanta', attributes: { size_key: '205/55R16' } }), kind: 'generic' },
  { name: 'generic/evil', product: p({ title: '<script>alert(1)</script><img src=x onerror=alert(2)>', vendor: '"><svg onload=alert(3)>', product_type: 'Cosa', attributes: { model: '&amp; </text><script>' } }) },
  // forced kinds with mismatched data
  { name: 'forced/tire-evil', product: p({ title: '<script>x</script>', vendor: '"><svg onload=alert(3)>', attributes: { size_key: '<b>205</b>', model: '&amp; </text><script>' } }), kind: 'tire' },
  { name: 'forced/part-plain', product: p({ title: 'Paraguas compacto', vendor: 'Ruta Libre' }), kind: 'part' },
  { name: 'forced/supplement-plain', product: p({ title: 'Paraguas compacto', vendor: 'Ruta Libre' }), kind: 'supplement' },
  { name: 'explicit/mockup-kind', product: p({ title: 'Cubeta', attributes: { mockup_kind: 'supplement', container: 'bolsa' } }) },
]
