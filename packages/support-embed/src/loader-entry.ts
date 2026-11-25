// Punto de entrada del bundle `dist/embed/loader.js` (IIFE, sin dependencias).
import { installLoader } from './loader'

const script = document.currentScript as HTMLScriptElement | null
if (script) {
  const run = () => installLoader({ doc: document, win: window, script })
  if (document.body) run()
  else document.addEventListener('DOMContentLoaded', run, { once: true })
}
