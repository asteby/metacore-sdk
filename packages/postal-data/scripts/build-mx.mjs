#!/usr/bin/env node
// Genera src/data/mx.json (catálogo código postal -> estado, municipio y colonias de México) desde el archivo
// MX.txt de GeoNames. Es el respaldo de @asteby/postal-data/mx cuando el catálogo de OPS (paquete de región
// region_mx) no contesta.
//
//   curl -O https://download.geonames.org/export/zip/MX.zip && unzip MX.zip MX.txt
//   node scripts/build-mx.mjs ./MX.txt
//
// Fuente: GeoNames Postal Code data (https://download.geonames.org/export/zip/), licencia Creative Commons
// Attribution 4.0 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). La atribución viaja en el propio JSON.
// Mismos nombres de estado que el paquete region_mx de OPS (clave INEGI de admin1; GeoNames aún dice «Distrito Federal»),
// para que la tienda dé la misma respuesta con OPS o sin él. Nada se inventa: solo filas del archivo.
import { readFileSync, writeFileSync } from "node:fs";

const STATES = {
  "01": "Aguascalientes", "02": "Baja California", "03": "Baja California Sur", "04": "Campeche", "05": "Coahuila",
  "06": "Colima", "07": "Chiapas", "08": "Chihuahua", "09": "Ciudad de México", "10": "Durango", "11": "Guanajuato",
  "12": "Guerrero", "13": "Hidalgo", "14": "Jalisco", "15": "Estado de México", "16": "Michoacán", "17": "Morelos",
  "18": "Nayarit", "19": "Nuevo León", "20": "Oaxaca", "21": "Puebla", "22": "Querétaro", "23": "Quintana Roo",
  "24": "San Luis Potosí", "25": "Sinaloa", "26": "Sonora", "27": "Tabasco", "28": "Tamaulipas", "29": "Tlaxcala",
  "30": "Veracruz", "31": "Yucatán", "32": "Zacatecas",
};

const input = process.argv[2];
if (!input) {
  console.error("uso: node scripts/build-mx.mjs ./MX.txt");
  process.exit(1);
}
const clean = (s) => (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const es = new Intl.Collator("es");
const states = Object.values(STATES);
const byCp = new Map();
for (const line of readFileSync(input, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const f = line.split("\t");
  const cp = f[1];
  if (f[0] !== "MX" || !/^\d{5}$/.test(cp ?? "")) continue;
  const state = STATES[f[4]];
  const colonia = clean(f[2]);
  const municipio = clean(f[5]);
  if (!state || !municipio) continue;
  const e = byCp.get(cp) ?? { places: new Map(), colonias: new Set() };
  const key = `${state}\t${municipio}`;
  e.places.set(key, (e.places.get(key) ?? 0) + 1);
  if (colonia) e.colonias.add(colonia);
  byCp.set(cp, e);
}
const cities = [];
const cityIdx = new Map();
const idx = (name) => cityIdx.get(name) ?? (cityIdx.set(name, cities.push(name) - 1), cityIdx.get(name));
const zips = {};
for (const cp of [...byCp.keys()].sort()) {
  const { places, colonias } = byCp.get(cp);
  // El estado y el municipio principales son los de más filas (empate: orden alfabético); si el CP cubre varios
  // municipios del estado, van todos (el primero es el principal) y el campo Ciudad queda editable.
  const ranked = [...places].sort((a, b) => b[1] - a[1] || es.compare(a[0], b[0]));
  const [state] = ranked[0][0].split("\t");
  const muns = [...new Set(ranked.map(([k]) => k.split("\t")).filter(([s]) => s === state).map(([, m]) => m))];
  zips[cp] = [states.indexOf(state), muns.map(idx), [...colonias].sort(es.compare)];
}
const out = {
  source: "GeoNames Postal Code data, https://download.geonames.org/export/zip/MX.zip",
  license: "CC BY 4.0, https://creativecommons.org/licenses/by/4.0/",
  attribution: "Datos de códigos postales © GeoNames (https://www.geonames.org), CC BY 4.0",
  states,
  cities,
  zips,
};
writeFileSync(new URL("../src/data/mx.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${Object.keys(zips).length} CP, ${cities.length} municipios, ${states.length} estados`);
