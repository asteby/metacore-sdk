#!/usr/bin/env node
// Genera src/data/us.json (catálogo ZIP -> estado y ciudad de EE. UU.) desde el archivo US.txt de GeoNames.
//
//   curl -O https://download.geonames.org/export/zip/US.zip && unzip US.zip US.txt
//   node scripts/build-us.mjs ./US.txt
//
// Fuente: GeoNames Postal Code data (https://download.geonames.org/export/zip/), licencia Creative Commons
// Attribution 4.0 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). La atribución viaja en el propio JSON.
// Una fila por ZIP (la ciudad principal); se omiten las de estado vacío (APO/FPO militares). Nada se inventa.
import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
if (!input) {
  console.error("uso: node scripts/build-us.mjs ./US.txt");
  process.exit(1);
}
const states = [];
const zips = {};
for (const line of readFileSync(input, "utf8").split("\n")) {
  const c = line.split("\t");
  const [, zip, city, state] = c;
  if (!/^\d{5}$/.test(zip ?? "") || !city || !state) continue;
  let i = states.indexOf(state);
  if (i < 0) i = states.push(state) - 1;
  zips[zip] = [i, city];
}
const sorted = Object.fromEntries(Object.keys(zips).sort().map((z) => [z, zips[z]]));
const out = {
  source: "GeoNames Postal Code data, https://download.geonames.org/export/zip/US.zip",
  license: "CC BY 4.0, https://creativecommons.org/licenses/by/4.0/",
  states,
  zips: sorted,
};
writeFileSync(new URL("../src/data/us.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${Object.keys(sorted).length} ZIP, ${states.length} estados`);
