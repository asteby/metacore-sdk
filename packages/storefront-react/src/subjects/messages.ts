/** Texts of the «My items» components. Spanish (es-MX) by default, English with `en*`, any locale with `messages`. */
import type { SubjectErrorCode } from './types.js'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] }

/**
 * `{kind}` is the singular name the store gave the kind, lowercased («vehículo»); `{name}` the label of an item. Nothing
 * here names a kind: the words come from the data the organization publishes.
 */
export type SubjectMessages = {
  garage: {
    empty: string
    add: string
    active: string
    makeActive: string
    edit: string
    remove: string
    removeConfirm: string
    removeHint: string
    viewParts: string
    limit: string
    loadError: string
    retry: string
    saved: string
    removed: string
    privateLabel: string
  }
  picker: {
    choose: string
    chooseFirst: string
    nickname: string
    nicknameHint: string
    privateNote: string
    privateKeep: string
    privateClear: string
    makeActive: string
    save: string
    saving: string
    cancel: string
    refine: string
    errors: Record<'required' | 'unknown' | 'invalid' | 'not_in_catalog' | 'year_range' | 'catalog_unavailable', string> & Record<SubjectErrorCode, string>
  }
  filter: {
    forItem: string
    change: string
    choose: string
    onlyFits: string
    showAll: string
    save: string
  }
  fit: { fits: string; universal: string; no: string; unknown: string }
}

const ES: SubjectMessages = {
  garage: {
    empty: 'Aún no guardas ningún {kind}.',
    add: 'Agregar {kind}',
    active: 'Activo',
    makeActive: 'Hacer activo',
    edit: 'Editar',
    remove: 'Eliminar',
    removeConfirm: 'Sí, eliminar {name}',
    removeHint: 'Se borra de verdad: no queda nada guardado.',
    viewParts: 'Ver piezas compatibles',
    limit: 'Llegaste al límite ({max}). Elimina uno para agregar otro.',
    loadError: 'No pudimos cargar esto.',
    retry: 'Reintentar',
    saved: 'Guardado.',
    removed: 'Eliminado.',
    privateLabel: '{field}: {value}',
  },
  picker: {
    choose: 'Elige…',
    chooseFirst: 'Primero elige el campo anterior',
    nickname: 'Apodo (opcional)',
    nicknameHint: 'Para reconocerlo, por ejemplo «El de diario».',
    privateNote: 'Solo tú lo ves. No se usa para buscar piezas ni se comparte.',
    privateKeep: 'Déjalo vacío para conservar el guardado.',
    privateClear: 'Quitar el guardado',
    makeActive: 'Usar como activo',
    save: 'Guardar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    refine: 'Continuar',
    errors: {
      required: 'Completa este campo.',
      unknown: 'Ese campo no existe.',
      invalid: 'El valor no es válido.',
      not_in_catalog: 'Elige una opción de la lista.',
      year_range: 'Ese año no corresponde a lo que elegiste.',
      catalog_unavailable: 'El catálogo no está disponible por ahora.',
      validation: 'Revisa los datos.',
      duplicate: 'Ya lo tienes guardado.',
      limit: 'Llegaste al límite. Elimina uno para agregar otro.',
      rate_limited: 'Demasiados intentos. Espera un momento.',
      unauthorized: 'Inicia sesión para continuar.',
      not_found: 'Ya no existe.',
      unsupported: 'Esta tienda no ofrece esto.',
      store_misconfigured: 'La tienda no está configurada para esto. Avísale al negocio.',
      unavailable: 'No pudimos guardar. Intenta de nuevo.',
    },
  },
  filter: {
    forItem: 'Para: {name}',
    change: 'Cambiar',
    choose: 'Elige tu {kind} para ver solo lo que le queda',
    onlyFits: 'Solo lo compatible',
    showAll: 'Ver todo',
    save: 'Guardar en mi cuenta',
  },
  fit: { fits: 'Compatible con tu {kind}', universal: 'Universal', no: 'No es para tu {kind}', unknown: 'Sin datos de compatibilidad' },
}

const EN: SubjectMessages = {
  garage: {
    empty: 'You have not saved any {kind} yet.',
    add: 'Add {kind}',
    active: 'Active',
    makeActive: 'Make active',
    edit: 'Edit',
    remove: 'Delete',
    removeConfirm: 'Yes, delete {name}',
    removeHint: 'It is really deleted: nothing is kept.',
    viewParts: 'See compatible parts',
    limit: 'You reached the limit ({max}). Delete one to add another.',
    loadError: 'We could not load this.',
    retry: 'Try again',
    saved: 'Saved.',
    removed: 'Deleted.',
    privateLabel: '{field}: {value}',
  },
  picker: {
    choose: 'Choose…',
    chooseFirst: 'Choose the previous field first',
    nickname: 'Nickname (optional)',
    nicknameHint: 'To recognize it, e.g. “The everyday one”.',
    privateNote: 'Only you see it. It is not used to search parts and it is never shared.',
    privateKeep: 'Leave it empty to keep the saved one.',
    privateClear: 'Remove the saved one',
    makeActive: 'Use as active',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    refine: 'Continue',
    errors: {
      required: 'Fill in this field.',
      unknown: 'That field does not exist.',
      invalid: 'The value is not valid.',
      not_in_catalog: 'Choose an option from the list.',
      year_range: 'That year does not match what you chose.',
      catalog_unavailable: 'The catalog is not available right now.',
      validation: 'Check the details.',
      duplicate: 'You already saved this.',
      limit: 'You reached the limit. Delete one to add another.',
      rate_limited: 'Too many attempts. Wait a moment.',
      unauthorized: 'Sign in to continue.',
      not_found: 'It no longer exists.',
      unsupported: 'This store does not offer this.',
      store_misconfigured: 'The store is not set up for this. Let the business know.',
      unavailable: 'We could not save. Try again.',
    },
  },
  filter: {
    forItem: 'For: {name}',
    change: 'Change',
    choose: 'Choose your {kind} to see only what fits',
    onlyFits: 'Only what fits',
    showAll: 'Show all',
    save: 'Save to my account',
  },
  fit: { fits: 'Fits your {kind}', universal: 'Universal', no: 'Not for your {kind}', unknown: 'No compatibility data' },
}

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    const cur = out[k]
    out[k] = cur && typeof cur === 'object' && typeof v === 'object' && v ? merge(cur, v as DeepPartial<typeof cur>) : v
  }
  return out as T
}

/** Messages for a locale (`en*` → English, else Spanish), with the store's overrides on top. */
export function subjectMessages(locale?: string, overrides?: DeepPartial<SubjectMessages>): SubjectMessages {
  return merge(locale?.toLowerCase().startsWith('en') ? EN : ES, overrides)
}

/** `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}
