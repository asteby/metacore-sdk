// Campos JSON (columnas jsonb/json/objeto) del formulario dinámico: lógica pura, sin React.
// Un campo estructurado NUNCA se pinta con `String(valor)` («[object Object]»): se edita como JSON con sangría y el valor que
// sale del formulario es el objeto ya analizado (o `null` si se vacía). Mientras el texto no sea JSON válido el campo emite el
// texto crudo, que la validación rechaza con «JSON inválido»: así no se puede guardar un valor roto ni perder lo que había.
import type { ActionFieldDef } from './types'

const JSON_TYPES = new Set(['json', 'jsonb', 'object'])

/** Campo declarado como JSON: `widget: "json"` o tipo `json`/`jsonb`/`object` (el kernel sirve jsonb así o como `textarea`). */
export function isJsonField(field: Pick<ActionFieldDef, 'type' | 'widget'>): boolean {
  return field.widget === 'json' || (typeof field.type === 'string' && JSON_TYPES.has(field.type))
}

/** Un valor estructurado (objeto o arreglo) que ningún input de texto puede mostrar tal cual. */
export function isStructuredValue(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object'
}

/** Texto que se muestra: JSON con sangría para objetos y arreglos; los textos pasan igual; nada → vacío. */
export function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

export type JsonInput = { ok: true; value: unknown } | { ok: false; raw: string }

/** Texto → valor: vacío = `null`; JSON válido = el valor; cualquier otra cosa = `{ ok: false }` (se conserva el texto crudo). */
export function parseJsonInput(text: string): JsonInput {
  if (text.trim() === '') return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, raw: text }
  }
}

/** ¿Es válido lo que hay en el formulario para un campo JSON? Objetos, arreglos y vacío siempre; un texto solo si es JSON. */
export function isValidJsonFormValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string') return true
  return parseJsonInput(value).ok
}
