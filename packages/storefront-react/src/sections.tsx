/**
 * Section registry: pages are ordered lists of `{ id, type, props }` (from
 * `content.page()`), and each `type` maps to a React component with a closed
 * props schema. The schema is what the OPS editor (and its AI agent) uses to
 * know which props exist, so props are validated and defaults merged before
 * rendering — the content is data, never markup.
 */
import { Fragment, type ComponentType, type ReactNode } from 'react'
import type { Section } from '@asteby/storefront'

export type SectionPropKind =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'url'
  | 'image'
  | 'color'
  | 'select'
  | 'collection'
  | 'product'
  | 'products'
  | 'list'

export type SectionPropSchema = {
  label: string
  kind: SectionPropKind
  description?: string
  default?: unknown
  required?: boolean
  /** `select` choices. */
  options?: readonly { value: string; label: string }[]
  /** `number` bounds. */
  min?: number
  max?: number
  /** `list` item schema. */
  items?: SectionSchema
}

export type SectionSchema = { readonly [prop: string]: SectionPropSchema }

type KindType<P extends SectionPropSchema> = P['kind'] extends 'number'
  ? number
  : P['kind'] extends 'boolean'
    ? boolean
    : P['kind'] extends 'products'
      ? string[]
      : P['kind'] extends 'list'
        ? P['items'] extends SectionSchema
          ? InferSectionProps<P['items']>[]
          : Record<string, unknown>[]
        : P['kind'] extends 'select'
          ? P['options'] extends readonly { value: infer V }[]
            ? V
            : string
          : string

type RequiredKeys<S extends SectionSchema> = {
  [K in keyof S]: S[K]['required'] extends true ? K : 'default' extends keyof S[K] ? K : never
}[keyof S]

/** Props type derived from a section schema (props with `default` or `required` are non-optional). */
export type InferSectionProps<S extends SectionSchema> = { [K in RequiredKeys<S>]: KindType<S[K]> } & {
  [K in Exclude<keyof S, RequiredKeys<S>>]?: KindType<S[K]>
}

export type SectionComponentProps<P, C = unknown> = P & {
  section: { id: string; type: string }
  /** Arbitrary data passed to `<Sections context>` (e.g. loader data). */
  context: C
}

export type SectionDefinition<P = Record<string, unknown>, C = any> = {
  type: string
  label?: string
  description?: string
  schema: SectionSchema
  component: ComponentType<SectionComponentProps<P, C>>
}

/**
 * Declares a section. Prop types are inferred from the schema:
 *
 *   export const hero = defineSection({
 *     type: 'hero',
 *     label: 'Hero',
 *     schema: {
 *       title: { label: 'Título', kind: 'text', required: true },
 *       cta_url: { label: 'Enlace', kind: 'url', default: '/' },
 *     },
 *     component: ({ title, cta_url }) => <section><h1>{title}</h1><a href={cta_url}>Ver</a></section>,
 *   })
 */
export function defineSection<const S extends SectionSchema, C = any>(definition: {
  type: string
  label?: string
  description?: string
  schema: S
  component: ComponentType<SectionComponentProps<InferSectionProps<S>, C>>
}): SectionDefinition<InferSectionProps<S>, C> {
  return definition as SectionDefinition<InferSectionProps<S>, C>
}

export type SectionPropError = { prop: string; message: string }

const STRING_KINDS = new Set<SectionPropKind>(['text', 'textarea', 'richtext', 'url', 'image', 'color', 'collection', 'product'])

function cloneDefault(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? structuredClone(value) : value
}

/**
 * Validates raw props against a schema: merges defaults, coerces numeric
 * strings, drops unknown props and replaces invalid values with the default.
 */
export function resolveSectionProps(schema: SectionSchema, raw: Record<string, unknown> | null | undefined, path = ''): { props: Record<string, unknown>; errors: SectionPropError[] } {
  const props: Record<string, unknown> = {}
  const errors: SectionPropError[] = []
  const input = raw ?? {}
  for (const [name, spec] of Object.entries(schema)) {
    const key = path ? `${path}.${name}` : name
    let value = input[name]
    const fail = (message: string) => {
      errors.push({ prop: key, message })
      if ('default' in spec) props[name] = cloneDefault(spec.default)
    }
    if (value === undefined || value === null || value === '') {
      if ('default' in spec) props[name] = cloneDefault(spec.default)
      else if (spec.required) errors.push({ prop: key, message: 'is required' })
      continue
    }
    if (STRING_KINDS.has(spec.kind)) {
      if (typeof value !== 'string') {
        fail('must be a string')
        continue
      }
    } else if (spec.kind === 'number') {
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value)
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail('must be a number')
        continue
      }
      if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
        fail(`must be between ${spec.min ?? '-∞'} and ${spec.max ?? '∞'}`)
        continue
      }
    } else if (spec.kind === 'boolean') {
      if (typeof value !== 'boolean') {
        fail('must be a boolean')
        continue
      }
    } else if (spec.kind === 'select') {
      if (typeof value !== 'string' || (spec.options && !spec.options.some((o) => o.value === value))) {
        fail(`must be one of ${(spec.options ?? []).map((o) => o.value).join(', ')}`)
        continue
      }
    } else if (spec.kind === 'products') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        fail('must be a list of product handles')
        continue
      }
    } else if (spec.kind === 'list') {
      if (!Array.isArray(value)) {
        fail('must be a list')
        continue
      }
      const items: unknown[] = []
      value.forEach((item, i) => {
        if (!spec.items) {
          items.push(item)
          return
        }
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          errors.push({ prop: `${key}[${i}]`, message: 'must be an object' })
          return
        }
        const resolved = resolveSectionProps(spec.items, item as Record<string, unknown>, `${key}[${i}]`)
        errors.push(...resolved.errors)
        items.push(resolved.props)
      })
      value = items
    }
    props[name] = value
  }
  return { props, errors }
}

/** JSON Schema (draft 2020-12) of a section, for the OPS editor (`section.schema.json`). */
export function sectionJsonSchema(definition: Pick<SectionDefinition, 'type' | 'label' | 'description' | 'schema'>): Record<string, unknown> {
  const toSchema = (schema: SectionSchema): Record<string, unknown> => {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [name, spec] of Object.entries(schema)) {
      const base: Record<string, unknown> = { title: spec.label, 'x-kind': spec.kind }
      if (spec.description) base.description = spec.description
      if ('default' in spec) base.default = spec.default
      if (spec.required) required.push(name)
      switch (spec.kind) {
        case 'number':
          Object.assign(base, { type: 'number' }, spec.min !== undefined ? { minimum: spec.min } : {}, spec.max !== undefined ? { maximum: spec.max } : {})
          break
        case 'boolean':
          base.type = 'boolean'
          break
        case 'select':
          Object.assign(base, { type: 'string', enum: (spec.options ?? []).map((o) => o.value), 'x-options': spec.options ?? [] })
          break
        case 'products':
          Object.assign(base, { type: 'array', items: { type: 'string' } })
          break
        case 'list':
          Object.assign(base, { type: 'array', items: spec.items ? toSchema(spec.items) : { type: 'object' } })
          break
        case 'url':
          Object.assign(base, { type: 'string', format: 'uri-reference' })
          break
        default:
          base.type = 'string'
      }
      properties[name] = base
    }
    return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) }
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `section:${definition.type}`,
    title: definition.label ?? definition.type,
    ...(definition.description ? { description: definition.description } : {}),
    ...toSchema(definition.schema),
  }
}

/** Map of section `type` → definition. */
export class SectionRegistry {
  private readonly defs = new Map<string, SectionDefinition<any, any>>()

  constructor(definitions: readonly SectionDefinition<any, any>[] = []) {
    for (const d of definitions) this.register(d)
  }

  register(definition: SectionDefinition<any, any>): this {
    this.defs.set(definition.type, definition)
    return this
  }

  get(type: string): SectionDefinition<any, any> | undefined {
    return this.defs.get(type)
  }

  has(type: string): boolean {
    return this.defs.has(type)
  }

  types(): string[] {
    return [...this.defs.keys()]
  }

  definitions(): SectionDefinition<any, any>[] {
    return [...this.defs.values()]
  }

  /** JSON Schemas of every registered section, keyed by type. */
  toJSONSchema(): Record<string, Record<string, unknown>> {
    return Object.fromEntries(this.definitions().map((d) => [d.type, sectionJsonSchema(d)]))
  }
}

export function createSectionRegistry(definitions: readonly SectionDefinition<any, any>[] = []): SectionRegistry {
  return new SectionRegistry(definitions)
}

const isDev = () => {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return p?.env?.NODE_ENV !== 'production'
}

export type SectionsProps<C = unknown> = {
  sections: readonly Section[] | null | undefined
  registry: SectionRegistry
  /** Passed to every section component as `context`. */
  context?: C
  /** Rendered for unknown types (default: nothing). */
  renderUnknown?: (section: Section) => ReactNode
  /** Called with validation problems (default: `console.warn` outside production). */
  onInvalid?: (section: Section, errors: SectionPropError[]) => void
}

/**
 * Renders sections in order. Unknown types are skipped (with a dev warning),
 * props are validated against the schema and defaults are merged; a section
 * missing a required prop is skipped.
 */
export function Sections<C = unknown>({ sections, registry, context, renderUnknown, onInvalid }: SectionsProps<C>) {
  if (!sections?.length) return null
  return (
    <>
      {sections.map((section, index) => {
        const key = section.id || `${section.type}-${index}`
        const def = registry.get(section.type)
        if (!def) {
          if (isDev()) console.warn(`[storefront-react] Unknown section type "${section.type}" (id ${section.id}); skipping.`)
          return renderUnknown ? <Fragment key={key}>{renderUnknown(section)}</Fragment> : null
        }
        const { props, errors } = resolveSectionProps(def.schema, section.props)
        if (errors.length) {
          if (onInvalid) onInvalid(section, errors)
          else if (isDev()) console.warn(`[storefront-react] Section "${section.type}" (id ${section.id}) has invalid props:`, errors)
        }
        // A missing required prop would break the component: skip the section.
        if (errors.some((e) => e.message === 'is required' && !e.prop.includes('[') && !e.prop.includes('.'))) return null
        const Component = def.component
        return <Component key={key} {...props} section={{ id: section.id, type: section.type }} context={context} />
      })}
    </>
  )
}
