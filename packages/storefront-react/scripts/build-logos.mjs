// Genera src/checkout/brands/logos.generated.ts (data URIs) y LOGOS.md desde brands/manifest.json + brands/assets/.
// Uso: node scripts/build-logos.mjs   (los assets ya vienen recortados y optimizados con svgo; ver LOGOS.md)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const dir = new URL('../src/checkout/brands/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'))

const svgUri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg.trim()).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%2C/g, ',').replace(/%3B/g, ';')

const entries = []
for (const [key, m] of Object.entries(manifest.logos).sort(([a], [b]) => a.localeCompare(b))) {
  const file = `assets/${key}.${m.format}`
  if (!existsSync(new URL(file, dir))) throw new Error(`falta ${file}`)
  const buf = readFileSync(new URL(file, dir))
  let src
  let ar
  if (m.format === 'svg') {
    const text = buf.toString('utf8')
    if (/<script|href=["']https?:|url\(["']?https?:|@import/i.test(text)) throw new Error(`${key}: el SVG referencia recursos externos o scripts`)
    const vb = /viewBox="([^"]+)"/.exec(text)
    if (!vb) throw new Error(`${key}: sin viewBox`)
    const [, , w, h] = vb[1].trim().split(/[ ,]+/).map(Number)
    ar = w / h
    src = svgUri(text)
  } else {
    ar = buf.readUInt32BE(16) / buf.readUInt32BE(20)
    src = `data:image/png;base64,${buf.toString('base64')}`
  }
  entries.push(`  ${JSON.stringify(key)}: { src: ${JSON.stringify(src)}, ar: ${Math.round(ar * 1000) / 1000}, mono: ${m.mode === 'mono'} },`)
}
writeFileSync(
  new URL('logos.generated.ts', dir),
  `// GENERADO por scripts/build-logos.mjs desde brands/manifest.json y brands/assets/. No editar a mano.\n// Procedencia y licencias de cada logo: brands/LOGOS.md.\nexport type LogoAsset = { src: string; ar: number; mono: boolean }\n\nexport const LOGOS: Record<string, LogoAsset> = {\n${entries.join('\n')}\n}\n`,
)

const rows = Object.entries(manifest.logos)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, m]) => `| \`${k}\` | ${m.name} | ${m.source} | ${m.license} | ${m.date} | ${m.mode === 'mono' ? 'Monocroma' : 'Color'} | ${m.format.toUpperCase()}${m.note ? ' — ' + m.note : ''} |`)
const pending = Object.entries(manifest.pending).map(([k, why]) => `- \`${k}\`: ${why}`)
writeFileSync(
  new URL('LOGOS.md', dir),
  `# Logos del checkout: procedencia y condiciones

Generado por \`scripts/build-logos.mjs\` desde \`manifest.json\`. No editar a mano.

Los logos son marcas registradas de sus titulares. Se muestran sin alteración para identificar el servicio o método de pago que la tienda ofrece, sin sugerir patrocinio ni respaldo; cada tienda debe respetar las guías de uso de marca de cada titular.

Tratamiento aplicado a todos: solo recorte de márgenes (viewBox ajustado al contenido), optimización con svgo y eliminación de \`width\`/\`height\`. No se recolorean ni deforman. Se incrustan como data URI: cero peticiones de red en runtime.

Orden de fuentes: (a) kit de prensa de la empresa, (b) logo que la propia empresa publica en su sitio, (c) Wikimedia Commons con licencia explícita, (d) Simple Icons (CC0, monocromo) solo como respaldo. Aquí no hizo falta (d): donde no había logo a color se dejó la insignia tipográfica.

## Logos incluidos

| Clave | Marca | URL de origen | Licencia / condiciones | Descarga | Versión | Formato |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Pendientes (insignia tipográfica de respaldo)

No se incluyen por no tener una fuente con condiciones claras:

${pending.join('\n')}

Una tienda que tenga el logo licenciado de cualquiera de estas marcas lo pasa como \`logo_url\` (gana sobre todo lo demás).

## Reproducir

\`\`\`
node scripts/build-logos.mjs
\`\`\`

Los assets de \`brands/assets/\` ya están optimizados. Para sustituir uno: descargarlo, fijar el viewBox al contenido, pasar \`svgo\` (\`removeViewBox: false\`, \`removeDimensions\`), guardarlo como \`assets/<clave>.svg\`, actualizar \`manifest.json\` y regenerar.
`,
)
console.log(`${entries.length} logos`)
