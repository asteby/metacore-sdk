/**
 * Product titles for people and for shopping feeds, built from what OPS already sends.
 *
 * Catalogs imported from an ERP arrive as `FILTRO AIRE NISSAN TSURU 1.6 L4 1992 1992`: all caps, no accents, repeated
 * years and abbreviations. These helpers only change how a title is SHOWN (product page, cards, `<title>`, JSON-LD,
 * Merchant Center / ChatGPT feeds). They never write back to OPS and never add facts: every word comes from the
 * product's title, brand (`vendor`) or attributes; the only additions are grammar (`de`, `para`) and expansions of
 * abbreviations (`IZQ` → `izquierda`).
 *
 * Two layers:
 * - `normalizeTitleText(text)`: any vertical. Sentence case for shouted text (words in the vocabulary go lowercase,
 *   unknown words keep a capital as likely names, codes stay uppercase), accents from the vocabulary, a repeated
 * word or an equal trailing year pair collapsed (`1992 1992` → `1992`; ranges only from attributes). Mixed-case text is left
 *   as the merchant wrote it (only spaces and the trailing years are tidied).
 * - `productTitle(product)`: when the product carries part attributes (type + vehicle), the title is composed as
 *   type + detail + position + drive + [brand + part number] + `para` + make + model + engine + year range. Without
 *   them it falls back to `normalizeTitleText(product.title)`.
 */
import type { Product, ProductAttributeValue } from './types.js'

export type TitleLocale = 'es' | 'en'

/** Attribute keys read by `productTitle`. Defaults match the auto-parts import profile (`pieza`, `vehiculo_marca`…). */
export type PartTitleKeys = {
  type: string
  detail: string
  position: string
  drive: string
  make: string
  model: string
  engine: string
  yearFrom: string
  yearTo: string
  partNumber: string
}

export const PART_TITLE_KEYS: PartTitleKeys = {
  type: 'pieza',
  detail: 'detalle',
  position: 'position',
  drive: 'traccion',
  make: 'vehiculo_marca',
  model: 'vehiculo_modelo',
  engine: 'motor',
  yearFrom: 'anio_desde',
  yearTo: 'anio_hasta',
  partNumber: 'part_number',
}

/** Words that need an accent in Spanish (key without it, lowercase). Only applied to text that came in uppercase. */
const ACCENTS_ES: Record<string, string> = {
  automatica: 'automática', automatico: 'automático', bujia: 'bujía', bujias: 'bujías', camion: 'camión',
  caliper: 'cáliper', ceramica: 'cerámica', ceramicas: 'cerámicas', cilindrica: 'cilíndrica', conica: 'cónica',
  deposito: 'depósito', diesel: 'diésel', direccion: 'dirección', diseno: 'diseño', electrica: 'eléctrica',
  electrico: 'eléctrico', estandar: 'estándar', hibrido: 'híbrido', hidraulica: 'hidráulica', hidraulico: 'hidráulico',
  japon: 'Japón', lamina: 'lámina', metalica: 'metálica', metalico: 'metálico', niquel: 'níquel', norteamerica: 'Norteamérica',
  america: 'América', organica: 'orgánica', organico: 'orgánico', piston: 'pistón', presion: 'presión', publico: 'público',
  rotula: 'rótula', rotulas: 'rótulas', semimetalica: 'semimetálica', semisintetico: 'semisintético', sintetico: 'sintético',
  sintetica: 'sintética', solido: 'sólido', suspension: 'suspensión', tapon: 'tapón', torsion: 'torsión', traccion: 'tracción',
  transmision: 'transmisión', valvula: 'válvula', vastago: 'vástago', version: 'versión', sedan: 'sedán', bateria: 'batería',
  electronico: 'electrónico', electronica: 'electrónica', termostato: 'termostato', inyeccion: 'inyección', proteina: 'proteína',
  vitamina: 'vitamina', energia: 'energía', capsulas: 'cápsulas', capsula: 'cápsula', kilometraje: 'kilometraje',
}

/** Accents for names (models), only when the name came in uppercase. */
const PROPER_ACCENTS_ES: Record<string, string> = { cordoba: 'Córdoba', leon: 'León', sedan: 'Sedán' }

/** Common Spanish words written in lowercase inside a sentence (besides the keys of `ACCENTS_ES`). */
const COMMON_ES = new Set(
  (
    'a al con de del el en la las los o para por sin y e u x ' +
    'aceite aire ajustador ajustable alto alta altura aluminio amortiguador ancho anterior arriba asistida aumento auto ' +
    'balata balatas balero barra barrenos base bajo bieleta bieletas birlos bomba booster brazo buje bujes cabeza cabina caja ' +
    'canales carrete cartucho casquillo central ceja chasis chico chicote cilindro combustible completo control cople corta corto ' +
    'cremallera cubre cuerda curva delgado desgaste disco doble eje electroasistida elevador ensamble entrada estabilizador ' +
    'excepto exterior filtro fina fierro flotante freno frenos frontal fundido garrafa gas gasolina goma grande hecho hembra ' +
    'hierro horquilla independiente interior juego kit lado larga largo lateral ligero litro litros macho maestro mineral ' +
    'modelos monogrado motor muelle multigrado normal ojillo paralela paso perno piezas piloto plataforma polea polvo posterior ' +
    'primeros puente puertos punta recta reforzado remachada remanufacturada repuesto resorte rueda segundo seguridad seguro ' +
    'sellos semi semieje sencilla sensor soporte sustituido tambor techo tensora terminal terminales tirante tope tornillo tractor ' +
    'transporte tubo tuerca universal varilla ventilado vueltas zapata rebote marcha motos maquinaria solo original ' +
    'delantero delantera trasero trasera inferior superior izquierdo izquierda derecho derecha ' +
    'pieza piezas juego llanta llantas rin sabor polvo tabletas cerrada licuadora conductor pasajero motriz chango lado unidad soporte'
  ).split(' '),
)

/** Short words (≤ 3 letters) that are words, not codes: lowercase in a sentence. */
const SHORT_WORDS_ES = new Set('a al con de del el en la las los o para por sin y e u x gas kit eje low par uno dos mm cm lb ml kg'.split(' '))

/** Codes with vowels that must stay uppercase in names (models, brands). Words without vowels always stay uppercase. */
const UPPER_NAMES = new Set(['RAM', 'DAI', 'TDI', 'GTI', 'SRT', 'API', 'SAE', 'ABS', 'USA', 'AMG', 'OEM', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI'])

/** Fixed spellings of ERP abbreviations and typos (uppercase key → text). */
const ABBREVIATIONS_ES: Record<string, string> = {
  'C/': 'con', 'S/': 'sin', 'P/': 'para', GDE: 'grande', CH: 'chico', INT: 'interior', EXT: 'exterior', PULG: 'pulg.',
  PZAS: 'piezas', LBS: 'lb', ORAGANICA: 'orgánica', REMACHADAA: 'remachada', BIERLOS: 'birlos',
  INFEROR: 'inferior', NFERIOR: 'inferior', STD: 'estándar', SEMIMETALICA: 'semimetálica',
  'TRANS.': 'transmisión', TRANS: 'transmisión', 'MAN.': 'manual', AUT: 'automática', 'AUT.': 'automática', 'CONT.': 'cont.', SINT: 'sint.', 'SINT.': 'sint.', IZQ: 'izq.', DER: 'der.', TRAS: 'tras.', INF: 'inf.', SUP: 'sup.', ALT: 'alt.', DIAM: 'diám.', LONG: 'long.', 'D.EXT.': 'diám. ext.', 'D.INT.': 'diám. int.', 'D.NOM.': 'diám. nom.',
}

/** Compound part types: `FILTRO AIRE` → `filtro de aire` (keys lowercase, no accents). */
const PART_TYPES_ES: Record<string, string> = {
  'filtro aire': 'filtro de aire', 'filtro aceite': 'filtro de aceite', 'filtro combustible': 'filtro de combustible',
  'filtro cabina': 'filtro de cabina', 'balata disco': 'balata de disco', 'balata tambor': 'balata de tambor',
  'terminal direccion': 'terminal de dirección', 'cilindro rueda': 'cilindro de rueda', 'aceite motor': 'aceite de motor',
  'base amortiguador': 'base de amortiguador', 'repuesto base amortiguador': 'repuesto de base de amortiguador',
  'kit caliper': 'kit de cáliper', 'kit tambor': 'kit de tambor', 'bomba direccion': 'bomba de dirección',
  'brazo direccion': 'brazo de dirección', 'caja direccion': 'caja de dirección', 'brazo suspension': 'brazo de suspensión',
  'chicote freno': 'chicote de freno', 'tope rebote': 'tope de rebote', 'piston caliper': 'pistón de cáliper',
  'repuesto freno': 'repuesto de freno', 'resorte suspension': 'resorte de suspensión', 'aumento resorte': 'aumento de resorte',
  'kit tope': 'kit de tope', 'ajustador balata': 'ajustador de balata', 'cople direccion': 'cople de dirección',
  'kit resorte': 'kit de resorte', 'repuesto direccion': 'repuesto de dirección', 'kit buje': 'kit de buje',
  'tornillo brazo elevador': 'tornillo de brazo elevador', 'barra torsion': 'barra de torsión', 'cubre polvo': 'cubrepolvo', 'seguro freno disco': 'seguro de freno de disco',
}

/** Feminine head nouns that do not end in -a (Spanish agreement of the position: `terminal derecha`). */
const FEMININE_ES = new Set(['terminal', 'base', 'llave', 'clave', 'red', 'mano', 'flor', 'piel', 'luz', 'calle', 'leche', 'fuente', 'gente', 'parte', 'serie'])
const MASCULINE_A_ES = new Set(['sistema', 'problema', 'kit'])

type Side = { axle: string[]; level: string[]; side: string[] }

/** Position words, canonical feminine form (`position` attribute) and abbreviations found in ERP text. */
const POSITION_WORDS: Record<string, keyof Side | null> = { delantera: 'axle', trasera: 'axle', inferior: 'level', superior: 'level', izquierda: 'side', derecha: 'side', central: null }
const POSITION_ABBREV: Record<string, string[]> = {
  DEL: ['delantera'], DELANTERO: ['delantera'], DELANTERA: ['delantera'], TRAS: ['trasera'], TRASERO: ['trasera'], TRASERA: ['trasera'],
  POSTERIOR: ['trasera'], ANTERIOR: ['delantera'], INF: ['inferior'], INFERIOR: ['inferior'], INFEROR: ['inferior'], NFERIOR: ['inferior'],
  SUP: ['superior'], SUPERIOR: ['superior'], IZQ: ['izquierda'], IZQUIERDO: ['izquierda'], IZQUIERDA: ['izquierda'], DER: ['derecha'],
  DERECHO: ['derecha'], DERECHA: ['derecha'], R: ['derecha'], L: ['izquierda'], DEIZQ: ['izquierda'], DEDER: ['derecha'],
  DELD: ['delantera', 'derecha'], DELF: ['delantera'], TRASD: ['trasera', 'derecha'], DELTRAS: ['delantera', 'trasera'],
}

const VOWEL = /[AEIOUÁÉÍÓÚaeiouáéíóú]/
const LETTER = /\p{L}/u
const isShouted = (text: string) => {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length
  return upper / letters.length > 0.8
}
const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '')
const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('es') + s.slice(1) : s)
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * `108MM` → `108 mm`, `4.73LTS` → `4.73 l`, `946ML.` → `946 ml`. A bare `M`, `L` or `G` only with a decimal
 * (`2.4L`): `3M` is a brand and `2L` an engine.
 */
function measure(token: string): string | null {
  const m = /^(\d+(?:[.,]\d+)?)(MM|CM|M|PULG|LBS|LB|LTS|LT|L|ML|KG|G|OZ)\.?$/i.exec(token)
  if (!m) return null
  const unit = m[2]!.toUpperCase()
  if ((unit === 'M' || unit === 'L' || unit === 'G') && !/[.,]/.test(m[1]!)) return null
  const map: Record<string, string> = { MM: 'mm', CM: 'cm', M: 'm', PULG: 'pulg.', LBS: 'lb', LB: 'lb', LTS: 'l', LT: 'l', L: 'l', ML: 'ml', KG: 'kg', G: 'g', OZ: 'oz' }
  return `${m[1]} ${map[unit]}`
}

/**
 * `946 ML.` / `5 LTS` → `946ML` / `5LTS` so `measure` reads them as one quantity. Litres only below 100 (`1500 LT` is a
 * Silverado trim, not 1,500 litres).
 */
const joinUnits = (s: string) =>
  s.replace(/\b(\d+(?:[.,]\d+)?)\s+(LTS|LT|L|ML|MM|CM|KG|LBS|LB)\b\.?/gi, (all, n: string, unit: string) =>
    /^L/i.test(unit) && Number(n.replace(',', '.')) >= 100 ? all : `${n}${unit}`,
  )

/** One token of shouted text inside a sentence (type, detail). */
function sentenceWord(token: string, locale: TitleLocale): string {
  if (!LETTER.test(token)) return token
  const upper = token.toUpperCase()
  if (locale === 'es' && ABBREVIATIONS_ES[upper]) return ABBREVIATIONS_ES[upper]
  if (/^C\/\d+$/i.test(token)) return `con ${token.slice(2)}` // `C/12` (caja con 12)
  if (/^[CSP]\/\p{L}{2,}\S*$/iu.test(token) && locale === 'es') return `${ABBREVIATIONS_ES[upper.slice(0, 2)]} ${sentenceWord(token.slice(2), locale)}`
  if (token.includes('-') && !/\d/.test(token)) return token.split('-').map((p) => sentenceWord(p, locale)).join('-')
  if (token.includes('/') && !/\d/.test(token)) return token.split('/').map((p) => sentenceWord(p, locale)).join('/')
  const m = measure(token)
  if (m) return m
  if (/^\p{L}+:$/u.test(token)) return `${sentenceWord(token.slice(0, -1), locale)}:`
  // `ALTO:6.2MM` → `alto: 6.2 mm`
  const label = /^(\p{L}+):(.+)$/u.exec(token)
  if (label) return `${sentenceWord(label[1]!, locale)}: ${sentenceWord(label[2]!, locale)}`
  if (/\d/.test(token)) return /^\d+X\d+$/i.test(token) ? token.toLowerCase() : upper // 4X2 → 4x2; L4, 15W40, GA-2372 stay
  const plain = stripAccents(token).toLowerCase()
  if (locale === 'es' && ACCENTS_ES[plain]) return ACCENTS_ES[plain]
  if (SHORT_WORDS_ES.has(plain) || COMMON_ES.has(plain)) return plain
  if (token.includes('.')) return upper // D.EXT., H.D.
  if (!VOWEL.test(token) || (plain.length <= 3 && !COMMON_ES.has(plain))) return upper // HD, PCV, API, TDI
  return token === upper ? capitalize(plain) : token // unknown word: probably a name (Gonher, Raptor)
}

/** One token of a name (make, model, brand, engine): capitalized unless it is a code. */
function nameWord(token: string, locale: TitleLocale): string {
  if (!LETTER.test(token)) return token
  if (token !== token.toUpperCase()) return token // already cased by the merchant: `Nissan`, `EcoSport`
  if (token.includes('-')) return token.split('-').map((p) => nameWord(p, locale)).join('-')
  if (/\d/.test(token)) return /^\d+X\d+$/i.test(token) ? token.toLowerCase() : token
  if (UPPER_NAMES.has(token) || !VOWEL.test(token) || token.length <= 2) return token // GM, BMW, CRV, PT, RAM
  const plain = stripAccents(token).toLowerCase()
  if (locale === 'es' && PROPER_ACCENTS_ES[plain]) return PROPER_ACCENTS_ES[plain]
  return capitalize(plain)
}

/** Names as written for people (`MASTER RIDE` → `Master Ride`, `TSURU III` → `Tsuru III`, `GM` → `GM`). */
export function normalizeName(text: string | null | undefined, locale: TitleLocale = 'es'): string {
  const s = squash(String(text ?? ''))
  return s ? s.split(' ').map((t) => nameWord(t, locale)).join(' ') : ''
}

/** Drops a WORD repeated right after itself (`ELEVADOR ELEVADOR`), case-insensitive. Numbers are never dropped (`RIN 15 15`). */
function dropRepeats(tokens: string[]): string[] {
  return tokens.filter((t, i) => i === 0 || /\d/.test(t) || stripAccents(t).toLowerCase() !== stripAccents(tokens[i - 1]!).toLowerCase())
}

/**
 * Only the trailing pair of equal years: `1992 1992` → `1992`. A pair of different numbers is left alone in free text
 * (`PEUGEOT 2008 2020` may be the model 2008): ranges are only written from the year attributes.
 */
function trailingYears(text: string): string {
  return text.replace(/\b((?:19|20)\d{2})\s+\1$/, '$1')
}

export type NormalizeTitleOptions = { locale?: TitleLocale }

/**
 * Any title, any vertical: tidies spaces, collapses a repeated word and the trailing year pair and, only when the text
 * is shouted (mostly uppercase), rewrites it in sentence case with accents. Never adds or reorders words.
 */
export function normalizeTitleText(text: string | null | undefined, options: NormalizeTitleOptions = {}): string {
  const locale = options.locale ?? 'es'
  let s = squash(String(text ?? ''))
  if (!s) return ''
  if (isShouted(s)) s = joinUnits(s)
  const tokens = dropRepeats(s.split(' '))
  if (isShouted(s)) {
    s = tokens.map((t) => sentenceWord(t, locale)).join(' ')
    s = capitalize(squash(s))
  } else {
    s = tokens.join(' ')
  }
  return trailingYears(s)
}

// ---------------------------------------------------------------------------
// Parts: composed from attributes
// ---------------------------------------------------------------------------

const attr = (attributes: Record<string, ProductAttributeValue> | undefined, key: string): string => {
  const v = attributes?.[key]
  return v === undefined || v === null || typeof v === 'boolean' ? '' : squash(String(v))
}

function isFeminine(headNoun: string): boolean {
  const w = stripAccents(headNoun).toLowerCase()
  if (FEMININE_ES.has(w)) return true
  if (MASCULINE_A_ES.has(w)) return false
  return /as?$/.test(w) || /(dad|tad|tud|ion|iones|ez|sis)$/.test(w)
}

/** Position words → `delantera inferior izquierda/derecha` agreeing with the head noun. */
function positionText(words: string[], feminine: boolean, locale: TitleLocale): string {
  const groups: Side = { axle: [], level: [], side: [] }
  const extra: string[] = []
  for (const raw of words) {
    const w = stripAccents(raw).toLowerCase()
    const g = POSITION_WORDS[w]
    if (g === undefined) continue
    if (g === null) extra.push(w)
    else if (!groups[g].includes(w)) groups[g].push(w)
  }
  const en: Record<string, string> = { delantera: 'front', trasera: 'rear', inferior: 'lower', superior: 'upper', izquierda: 'left', derecha: 'right', central: 'center' }
  const agree = (w: string) => (locale === 'en' ? (en[w] ?? w) : feminine || !/a$/.test(w) ? w : w.replace(/a$/, 'o'))
  const order = ['delantera', 'trasera', 'superior', 'inferior', 'izquierda', 'derecha']
  const sorted = (list: string[]) => list.slice().sort((x, y) => order.indexOf(x) - order.indexOf(y))
  return [...(['axle', 'level', 'side'] as const).map((k) => sorted(groups[k]).map(agree).join('/')), ...extra.map(agree)].filter(Boolean).join(' ')
}

/** `Aceite motor aceite multigrado…` → `Aceite de motor multigrado…`: known compound at the start, its head not repeated. */
function withPartType(title: string, locale: TitleLocale): string {
  if (locale !== 'es') return title
  const words = title.split(' ')
  for (let n = Math.min(4, words.length); n >= 2; n--) {
    const key = stripAccents(words.slice(0, n).join(' ')).toLowerCase()
    const compound = PART_TYPES_ES[key]
    if (!compound) continue
    const rest = words.slice(n)
    // `ACEITE MOTOR ACEITE [MOTOR] MINERAL`: the compound repeated (in full or its first words) right after itself.
    const keyWords = key.split(' ')
    let same = 0
    while (same < keyWords.length && rest[same] && stripAccents(rest[same]!).toLowerCase() === keyWords[same]) same++
    rest.splice(0, same)
    return capitalize([compound, ...rest].join(' '))
  }
  return title
}

function partType(raw: string, locale: TitleLocale): string {
  const tokens = dropRepeats(squash(raw).split(' '))
  const key = stripAccents(tokens.join(' ')).toLowerCase()
  if (locale === 'es') {
    if (PART_TYPES_ES[key]) return PART_TYPES_ES[key]
    // Longest known compound at the start (`FILTRO AIRE ALTO FLUJO` → `filtro de aire alto flujo`).
    for (let n = tokens.length - 1; n >= 2; n--) {
      const head = stripAccents(tokens.slice(0, n).join(' ')).toLowerCase()
      if (PART_TYPES_ES[head]) return `${PART_TYPES_ES[head]} ${tokens.slice(n).map((t) => sentenceWord(t, locale)).join(' ')}`
    }
  }
  return tokens.map((t) => (isShouted(t) || t.length <= 1 || SHORT_WORDS_ES.has(stripAccents(t).toLowerCase()) ? sentenceWord(t, locale) : t)).join(' ')
}

/** Detail text without the position words it repeats; position abbreviations are returned apart. */
function splitDetail(raw: string): { words: string[]; positions: string[] } {
  const words: string[] = []
  const positions: string[] = []
  // `/ VENTILADO / 4 BARRENOS X 108MM /` → comma-separated phrases; a dangling connector at the end is dropped.
  const tokens = squash(joinUnits(raw).replace(/\s*\/\s+|\s+\/\s*|^\/|\/$/g, ' , ')).split(' ').filter(Boolean)
  for (const [i, t] of tokens.entries()) {
    // A lone `R`/`L` is the side only when it is the whole detail (`TERMINAL DIRECCION R`); elsewhere it can be litres.
    if (/^[RL]$/i.test(t) && tokens.length > 1) {
      words.push(t)
      continue
    }
    const up = stripAccents(t).toUpperCase().replace(/\.$/, '')
    const pair = up.split('/')
    if (pair.length > 1 && pair.every((p) => POSITION_ABBREV[p] || /^DE(DER|IZQ)$/.test(p))) {
      for (const p of pair) positions.push(...(POSITION_ABBREV[p] ?? []))
      continue
    }
    // `DEL` is also the preposition (`LADO DEL CONDUCTOR`): a position only last or next to another position word.
    if (up === 'DEL') {
      const next = stripAccents(tokens[i + 1] ?? '').toUpperCase().replace(/\.$/, '')
      const isPosition = !next || !!POSITION_ABBREV[next] || next.split('/').every((p) => POSITION_ABBREV[p])
      if (!isPosition) {
        words.push(t)
        continue
      }
    }
    if (POSITION_ABBREV[up]) {
      positions.push(...POSITION_ABBREV[up]!)
      continue
    }
    words.push(t)
  }
  while (words.length && /^(,|Y|O|E|PARA|CON|SIN|DE|P\/|C\/|S\/)$/i.test(words[words.length - 1]!)) words.pop()
  // `CERAMICA PARA EJE [DELANTERO Y TRASERO]`: the axle words went to the position, a bare `para eje` says nothing.
  if (/^PARA EJE$/i.test(words.slice(-2).join(' '))) {
    words.splice(-2, 2)
    while (words.length && /^(,|Y|O|E|PARA|CON|SIN|DE)$/i.test(words[words.length - 1]!)) words.pop()
  }
  while (words.length && words[0] === ',') words.shift()
  return { words, positions }
}

function yearRange(from: string, to: string): string {
  const a = /^\d{4}$/.test(from) ? Number(from) : null
  const b = /^\d{4}$/.test(to) ? Number(to) : null
  if (a && b) return a === b ? String(a) : a < b ? `${a}–${b}` : `${b}–${a}`
  return String(a ?? b ?? '')
}

export type ProductTitleOptions = {
  locale?: TitleLocale
  /** Adds the brand (`vendor`) and the part number before `para`: the form for `<title>`, JSON-LD and feeds. */
  identifiers?: boolean
  /** Attribute keys (defaults: `PART_TITLE_KEYS`). */
  keys?: Partial<PartTitleKeys>
}

type TitleSource = Pick<Product, 'title'> & Partial<Pick<Product, 'attributes' | 'vendor' | 'variants'>>

/** Part number: the `part_number` attribute, else the SKU of a single-variant product. */
export function productPartNumber(product: TitleSource, keys: Partial<PartTitleKeys> = {}): string | null {
  const k = { ...PART_TITLE_KEYS, ...keys }
  const pn = attr(product.attributes, k.partNumber)
  if (pn) return pn
  return product.variants?.length === 1 && product.variants[0]!.sku ? product.variants[0]!.sku : null
}

/**
 * Title of a product for people. With part attributes (type + make or model) it is composed from them; otherwise it
 * is `normalizeTitleText(product.title)`. `identifiers: true` adds brand + part number (unique per item: use it for
 * `<title>`, JSON-LD and feeds).
 */
export function productTitle(product: TitleSource, options: ProductTitleOptions = {}): string {
  const locale = options.locale ?? 'es'
  const k = { ...PART_TITLE_KEYS, ...options.keys }
  const a = product.attributes
  const type = attr(a, k.type)
  const make = attr(a, k.make)
  const model = attr(a, k.model)
  const brand = product.vendor ? normalizeName(product.vendor, locale) : ''
  const pn = options.identifiers ? productPartNumber(product, k) : null

  if (!type || (!make && !model)) {
    const base = withPartType(normalizeTitleText(product.title, { locale }), locale)
    if (!options.identifiers) return base
    const plain = stripAccents(base).toLowerCase()
    const add = [brand && !plain.includes(stripAccents(brand).toLowerCase()) ? brand : '', pn && !plain.includes(pn.toLowerCase()) ? pn : '']
    return squash([base, ...add].join(' '))
  }

  const head = partType(type, locale)
  const detail = splitDetail(attr(a, k.detail))
  const positionAttr = attr(a, k.position)
    .split(/[/,\s]+/)
    .filter(Boolean)
  const positions = positionText([...positionAttr, ...detail.positions], isFeminine(head.split(' ')[0] ?? ''), locale)
  // `AMORTIGUADOR` + `GAS` → `amortiguador de gas`.
  if (locale === 'es' && /^(GAS|ACEITE)$/i.test(detail.words[0] ?? '')) detail.words.unshift('de')
  const detailText = squash(detail.words.map((t) => (t === ',' ? ',' : sentenceWord(t, locale))).join(' ').replace(/\s+,/g, ','))
  // Drive (`4X2`, `FWD`) only when the detail does not already say it.
  const drive = attr(a, k.drive)
  const driveText = drive && !stripAccents(detailText).toLowerCase().includes(drive.toLowerCase()) ? (/^\d+X\d+$/i.test(drive) ? drive.toLowerCase() : drive.toUpperCase()) : ''
  const engine = normalizeName(attr(a, k.engine), locale)
  const years = yearRange(attr(a, k.yearFrom), attr(a, k.yearTo))
  const vehicle = squash([normalizeName(make, locale), normalizeName(model, locale), engine, years].join(' '))
  const ids = options.identifiers ? squash([brand, pn ?? ''].join(' ')) : ''
  const forWord = locale === 'en' ? 'for' : 'para'
  const what = squash([head, detailText, positions, driveText].join(' ')).replace(/,$/, '')
  return capitalize(squash([what, ids, vehicle ? `${forWord} ${vehicle}` : ''].join(' ')))
}

/**
 * Titles for a list shown together (cards, carousels): `productTitle` and, for two products that would read the
 * same, the brand and part number appended (` · Unicar UD2510003`), so two different parts never look like one.
 */
export function distinctProductTitles<T extends TitleSource & Pick<Product, 'id'>>(products: readonly T[], options: Omit<ProductTitleOptions, 'identifiers'> = {}): Map<string, string> {
  const base = new Map(products.map((p) => [p.id, productTitle(p, options)]))
  const count = new Map<string, number>()
  for (const t of base.values()) count.set(t.toLowerCase(), (count.get(t.toLowerCase()) ?? 0) + 1)
  const out = new Map<string, string>()
  for (const p of products) {
    const t = base.get(p.id)!
    if ((count.get(t.toLowerCase()) ?? 0) < 2) {
      out.set(p.id, t)
      continue
    }
    const ids = squash([p.vendor ? normalizeName(p.vendor, options.locale) : '', productPartNumber(p, options.keys) ?? ''].join(' '))
    out.set(p.id, ids ? `${t} · ${ids}` : t)
  }
  return out
}
