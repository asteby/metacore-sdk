#!/usr/bin/env node
// Copia los logos de marcas de vehículo del paquete a la carpeta pública de la tienda.
// Uso (en la tienda, p. ej. en "prebuild" y "predev"):  asteby-vehicle-makes public/vehicle-makes
// Así hay una sola fuente (este paquete) y la tienda los sirve como estáticos con su propio caché.
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dest = resolve(process.argv[2] ?? 'public/vehicle-makes')
const src = fileURLToPath(new URL('../vehicle-makes/', import.meta.url))
mkdirSync(dest, { recursive: true })
let n = 0
for (const f of readdirSync(src)) {
  if (!f.endsWith('.webp')) continue
  cpSync(resolve(src, f), resolve(dest, f))
  n++
}
console.log(`asteby-vehicle-makes: ${n} logos → ${dest}`)
