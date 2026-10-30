// Copia el CSS plano de /ui a dist (tsup solo emite JS). El @import de swatch.css se resuelve aquí en un solo archivo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const preview = readFileSync(new URL('../src/ui/product-preview.css', import.meta.url), 'utf8')
const withPreview = (css) => `${css}\n${preview}`
const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8')
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
// Una sola fuente del scroll: la hoja de @asteby/metacore-theme (se inlinea, así el paquete no depende del tema en runtime).
const scrollbars = readFileSync(new URL('../../theme/styles/scrollbars.css', import.meta.url), 'utf8')
writeFileSync(new URL('../dist/ui.css', import.meta.url), `${scrollbars}\n${read('ui.css').replace('@import "./swatch.css";', read('swatch.css'))}\n${preview}`)

// Hoja por omisión del cajón del carrito (subpath /cart).
writeFileSync(new URL('../dist/cart.css', import.meta.url), withPreview(readFileSync(new URL('../src/cart-drawer/cart-drawer.css', import.meta.url), 'utf8')))

// Hoja por omisión de la sección «Método de pago» (subpath /payments).
writeFileSync(new URL('../dist/payments.css', import.meta.url), readFileSync(new URL('../src/payments/payments.css', import.meta.url), 'utf8'))

// Hoja por omisión de «Entrega» y las marcas (subpath /checkout).
writeFileSync(new URL('../dist/checkout.css', import.meta.url), withPreview(readFileSync(new URL('../src/checkout/checkout.css', import.meta.url), 'utf8')))

// Hoja por omisión de la pantalla de cuenta (subpath /account).
writeFileSync(new URL('../dist/account.css', import.meta.url), withPreview(readFileSync(new URL('../src/account/account.css', import.meta.url), 'utf8')))

// Hoja por omisión de la facturación (subpath /fiscal).
writeFileSync(new URL('../dist/fiscal.css', import.meta.url), readFileSync(new URL('../src/fiscal/fiscal.css', import.meta.url), 'utf8'))

// Hoja por omisión del rastreo de envíos (subpath /tracking).
writeFileSync(new URL('../dist/tracking.css', import.meta.url), readFileSync(new URL('../src/tracking/tracking.css', import.meta.url), 'utf8'))

// Hoja por omisión de los componentes de contacto (subpath /contact).
writeFileSync(new URL('../dist/contact.css', import.meta.url), readFileSync(new URL('../src/contact/contact.css', import.meta.url), 'utf8'))

// Hoja por omisión de «Mis artículos» (subpath /subjects).
writeFileSync(new URL('../dist/subjects.css', import.meta.url), readFileSync(new URL('../src/subjects/subjects.css', import.meta.url), 'utf8'))

// Hoja de NavigationProgress, Skeleton y Spinner (subpath /ui), sin el resto de ui.css.
writeFileSync(new URL('../dist/progress.css', import.meta.url), read('progress.css'))
