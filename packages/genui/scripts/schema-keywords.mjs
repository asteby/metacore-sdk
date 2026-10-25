// Lista blanca de keywords de JSON Schema que entiende el intérprete de
// src/validate-v2.ts. El intérprete falla cerrado: un keyword fuera de esta lista
// en el esquema haría que se ignorase una restricción sin avisar, así que el
// codegen y un test fallan si aparece uno (if/then, allOf, not, minLength,
// uniqueItems, patternProperties, exclusiveMinimum...).
export const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'default',
  'type', 'const', 'enum', 'anyOf', 'oneOf',
  'properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'items', 'minItems', 'maxItems',
  'maxLength', 'pattern', 'minimum', 'maximum',
  // extensiones propias de genui
  'x-genui', 'x-discriminator', 'x-error',
])

const MAP_KEYWORDS = new Set(['properties', '$defs'])
const SCHEMA_KEYWORDS = new Set(['items', 'additionalProperties', 'propertyNames'])
const LIST_KEYWORDS = new Set(['anyOf', 'oneOf'])

/** Devuelve `[ruta, keyword]` de cada keyword no soportado. */
export function findUnsupported(schema, path = '#') {
  const out = []
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return out
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(k)) out.push([path, k])
    else if (MAP_KEYWORDS.has(k)) for (const [n, sub] of Object.entries(v)) out.push(...findUnsupported(sub, `${path}/${k}/${n}`))
    else if (SCHEMA_KEYWORDS.has(k) && typeof v === 'object') out.push(...findUnsupported(v, `${path}/${k}`))
    else if (LIST_KEYWORDS.has(k)) v.forEach((sub, i) => out.push(...findUnsupported(sub, `${path}/${k}/${i}`)))
  }
  return out
}
