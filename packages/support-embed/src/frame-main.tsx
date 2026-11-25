// Punto de entrada del bundle `dist/embed/frame.js`. Los listeners de `message` se instalan de
// inmediato (antes de montar React) para no perder el primer `hello` del loader.
import { bootFrame } from './frame-boot'

const container = document.getElementById('root')
if (container) bootFrame(window, document, container)
