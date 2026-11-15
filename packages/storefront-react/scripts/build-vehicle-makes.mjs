// Regenera src/fitment/vehicle-makes.generated.ts desde vehicle-makes/*.webp (la lista de marcas con logo).
// Uso: node scripts/build-vehicle-makes.mjs   (los .webp ya vienen normalizados: 128×128, logo contenido con
// aire uniforme y fondo transparente; ver vehicle-makes/README.md).
import { readdirSync, writeFileSync } from 'node:fs'

const dir = new URL('../vehicle-makes/', import.meta.url)
const slugs = readdirSync(dir)
  .filter((f) => f.endsWith('.webp'))
  .map((f) => f.slice(0, -'.webp'.length))
  .sort()
for (const s of slugs) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) throw new Error(`slug inválido: ${s}`)

const body = slugs.map((s) => `  '${s}',`).join('\n')
writeFileSync(
  new URL('../src/fitment/vehicle-makes.generated.ts', import.meta.url),
  `// Generado por scripts/build-vehicle-makes.mjs desde vehicle-makes/*.webp. No editar a mano.\n/** Marcas de vehículo con logo en \`vehicle-makes/<slug>.webp\`. */\nexport const VEHICLE_MAKE_LOGO_SLUGS: readonly string[] = [\n${body}\n]\n`,
)
console.log(`${slugs.length} marcas`)
