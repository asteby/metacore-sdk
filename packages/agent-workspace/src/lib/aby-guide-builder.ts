import { abyGuidance, type AbyGuide, type AbyGuideStep } from './aby-guidance'

export type GuideFieldHint = {
  key: string
  label: string
  required?: boolean
  help?: string
  /** Mirrors modal FieldDef — excluded from create tours (same as SDK filterVisibleFields). */
  hidden?: boolean
  readonly?: boolean
}

export type SyntheticGuideSource = {
  /** URL segment / table key used in /m/{model} (e.g. customers, products). */
  model: string
  /** Human label already resolved for the current locale when possible. */
  label: string
  /** Sidebar URL as stamped on navigation.* targets (e.g. /m/customers). */
  navUrl: string
  /** AccessGate: caller already verified create permission + visible nav. */
  fields?: GuideFieldHint[]
}

const SYNTH_OWNER = 'synthetic'
const cleanups = new Map<string, () => void>()

/** Keys that never belong in a create walkthrough (system / migration). */
const SKIP_FIELD_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'organization_id',
  'external_id',
])

function humanLabel(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'registro'
  if (!trimmed.includes('.') || /\s/.test(trimmed)) return trimmed
  const leaf = trimmed.split('.').filter(Boolean).pop() || trimmed
  return leaf.replace(/_/g, ' ')
}

/**
 * Fields the create dialog will actually paint — mirrors SDK
 * `filterVisibleFields(..., 'create')`: drop hidden + readonly, plus known
 * system/migration keys. Exported for tests.
 */
export function pickCreateGuideFields(fields: GuideFieldHint[], limit = 8): GuideFieldHint[] {
  const usable = fields.filter((f) => {
    if (!f.key || SKIP_FIELD_KEYS.has(f.key)) return false
    if (f.hidden || f.readonly) return false
    return true
  })
  return [
    ...usable.filter((f) => f.required),
    ...usable.filter((f) => !f.required),
  ].slice(0, limit)
}

function fieldSteps(model: string, fields: GuideFieldHint[]): AbyGuideStep[] {
  return pickCreateGuideFields(fields).map((field) => ({
    id: `field-${field.key}`,
    route: `/m/${model}`,
    target: `model.${model}.create.field.${field.key}`,
    title: humanLabel(field.label || field.key),
    description:
      field.help?.trim() ||
      (field.required
        ? `Completa este campo obligatorio.`
        : `Opcional: completa este campo si aplica.`),
    optional: !field.required,
  }))
}

/**
 * Builds a sidebar → Crear → fields → submit tour for one accessible model.
 * Everything comes from the nav leaf + model metadata: the label and field
 * labels feed the title/description the chat model reads to decide when the
 * user wants THIS walkthrough — no per-language phrase templates.
 */
export function buildCreateGuide(source: SyntheticGuideSource): AbyGuide | null {
  const model = source.model.trim()
  if (!model) return null
  const label = humanLabel(source.label || model)
  const navUrl = source.navUrl.startsWith('/') ? source.navUrl : `/${source.navUrl}`
  const fields = fieldSteps(model, source.fields ?? [])
  const steps: AbyGuideStep[] = [
    {
      id: 'nav',
      target: `navigation.${navUrl}`,
      title: `Ve a ${label}`,
      description: `En el menú lateral abre «${label}» para continuar.`,
      advanceOn: { event: 'click' },
    },
    {
      id: 'create',
      route: `/m/${model}`,
      target: `model.${model}.create`,
      title: 'Pulsa Crear',
      description: `Abre el formulario para agregar un registro en «${label}».`,
      advanceOn: { event: 'click' },
    },
    ...fields,
    {
      id: 'submit',
      route: `/m/${model}`,
      target: `model.${model}.create.submit`,
      title: 'Guarda',
      description: 'Cuando los datos estén listos, guarda el registro.',
    },
  ]
  const fieldNames = fields.map((step) => step.title).join(', ')

  return {
    id: `synth.create.${model}`,
    owner: SYNTH_OWNER,
    title: `Crear en ${label}`,
    description:
      `Recorrido en pantalla para agregar un registro en «${label}»: menú lateral → Crear` +
      (fieldNames ? ` → ${fieldNames}` : '') +
      ' → Guardar.',
    intents: [label],
    steps,
  }
}

/**
 * Registers synthetic CRUD guides for every AccessGate-approved source.
 * Declared (manifest) guides win: we skip synth ids that already exist, and
 * never replace a non-synthetic registration.
 */
export function syncSyntheticGuides(sources: SyntheticGuideSource[]): void {
  const nextIds = new Set<string>()
  const existing = new Map(abyGuidance.listGuides().map((g) => [g.id, g]))

  for (const source of sources) {
    const guide = buildCreateGuide(source)
    if (!guide) continue
    nextIds.add(guide.id)
    const prior = existing.get(guide.id)
    if (prior && prior.owner !== SYNTH_OWNER) continue
    // Re-register to pick up fresher field metadata.
    cleanups.get(guide.id)?.()
    try {
      cleanups.set(guide.id, abyGuidance.registerGuide(guide))
    } catch {
      cleanups.delete(guide.id)
    }
  }

  for (const [id, cleanup] of [...cleanups.entries()]) {
    if (nextIds.has(id)) continue
    cleanup()
    cleanups.delete(id)
  }
}

/** Parse /m/{model} (with optional query) from a sidebar URL. */
export function modelFromNavUrl(url: string): string | null {
  const path = url.split('?')[0] || ''
  const match = path.match(/\/m\/([^/]+)/)
  return match?.[1] ?? null
}
