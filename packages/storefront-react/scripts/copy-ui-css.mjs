// Copia el CSS plano de /ui a dist (tsup solo emite JS). El @import de swatch.css se resuelve aquí en un solo archivo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8')
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
// Una sola fuente del scroll: la hoja de @asteby/metacore-theme (se inlinea, así el paquete no depende del tema en runtime).
const scrollbars = readFileSync(new URL('../../theme/styles/scrollbars.css', import.meta.url), 'utf8')
writeFileSync(new URL('../dist/ui.css', import.meta.url), `${scrollbars}\n${read('ui.css').replace('@import "./swatch.css";', read('swatch.css'))}`)

// Hoja por omisión del cajón del carrito (subpath /cart).
writeFileSync(new URL('../dist/cart.css', import.meta.url), readFileSync(new URL('../src/cart-drawer/cart-drawer.css', import.meta.url), 'utf8'))

// Hoja por omisión de la sección «Método de pago» (subpath /payments).
writeFileSync(new URL('../dist/payments.css', import.meta.url), readFileSync(new URL('../src/payments/payments.css', import.meta.url), 'utf8'))
