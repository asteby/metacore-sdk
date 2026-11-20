import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Model-driven labels. A backend often ships generic/English titles
 * ("Clients", "New Client"); the SDK resolves them through i18n from the model
 * key so the host can translate (or rebrand) per model without touching code:
 *
 *   models.<model>.title     -> list/page title            ("Clientes")
 *   models.<model>.singular  -> singular name              ("Cliente")
 *   models.<model>.new       -> create button label        ("Nuevo cliente")
 *
 * Every key is looked up in the host's i18n resources (also addon namespaces
 * merged by `I18nProvider`). Order: explicit override > `titleKey` from
 * metadata > `models.<model>.*` > backend text > generic fallback. When no
 * `models.<model>.new` exists the label is `common.new_model` interpolated
 * with the singular name (`{{prefix}} {{name}}`), prefix overridable via
 * `common.new`.
 *
 * Backend-declared names (already localized by the kernel/bridge) slot in below
 * the host i18n keys: `singular_label` feeds the singular and `new_label` the
 * create label, so a backend that ships "cliente"/"Nuevo cliente" never needs a
 * per-model i18n entry. The create prefix honours grammatical gender
 * (`common.new_f` = "Nueva", `common.new_m` = "Nuevo") before the neutral `common.new`.
 */
export type ModelLabelT = (key: string, opts?: Record<string, unknown>) => string

export interface ModelLabelInput {
    model: string
    /** Backend title (already possibly localized). */
    title?: string
    /** Backend i18n key for the title (`titleKey`/`title_key`). */
    titleKey?: string
    /** Prefix fallback for the create label when nothing translates (default "New"). */
    newPrefix?: string
    titleOverride?: string
    newLabelOverride?: string
    /** Backend singular noun (`singular_label`), e.g. "cliente". */
    singularLabel?: string
    /** Backend create label (`new_label`), e.g. "Nuevo cliente". */
    newLabelMeta?: string
    /** Grammatical gender of the singular ("m" | "f" | "n"); picks `common.new_<gender>`. */
    gender?: string
}

export interface ModelLabels {
    title: string
    singular: string
    newLabel: string
}

const MISSING = '\u0000'

/** Returns the translation or undefined when the key has no value. */
function tryKey(t: ModelLabelT, key: string | undefined): string | undefined {
    if (!key) return undefined
    const v = t(key, { defaultValue: MISSING })
    return v && v !== MISSING && v !== key ? v : undefined
}

export function defaultSingular(title: string): string {
    const s = title.replace(/s$/i, '')
    return s.charAt(0).toUpperCase() + s.slice(1)
}

export function resolveModelLabels(t: ModelLabelT, input: ModelLabelInput): ModelLabels {
    const { model } = input
    const title =
        input.titleOverride ??
        tryKey(t, input.titleKey) ??
        tryKey(t, `models.${model}.title`) ??
        input.title ??
        model
    const singular =
        tryKey(t, `models.${model}.singular`) ?? input.singularLabel ?? defaultSingular(title)
    const newLabel =
        input.newLabelOverride ??
        tryKey(t, `models.${model}.new`) ??
        input.newLabelMeta ??
        `${tryKey(t, input.gender ? `common.new_${input.gender}` : undefined) ?? tryKey(t, 'common.new') ?? input.newPrefix ?? 'New'} ${singular}`
    return { title, singular, newLabel }
}

export interface ModelNounInput {
    model: string
    singularLabel?: string
    titleKey?: string
    title?: string
}

/**
 * Noun used inside dialog verbs ("Editar {noun}"). Order: host i18n
 * `models.<model>.singular` > backend `singular_label` > translated `titleKey`
 * > backend `title`. Empty string when nothing is known (caller falls back).
 */
export function resolveModelNoun(t: ModelLabelT, input: ModelNounInput): string {
    return (
        tryKey(t, input.model ? `models.${input.model}.singular` : undefined) ??
        (input.singularLabel?.trim() || undefined) ??
        tryKey(t, input.titleKey) ??
        input.title ??
        ''
    )
}

/** Dialog verb ("Crear {{name}}", "Editar {{name}}", "Eliminar {{name}}") through i18n `dynamic.<verb>_title`. */
export function modelVerbTitle(t: ModelLabelT, verb: 'create' | 'edit' | 'delete', name: string, fallback: string): string {
    return t(`dynamic.${verb}_title`, { name, defaultValue: fallback })
}

/** Hook form of {@link resolveModelLabels}, bound to the active i18n instance. */
export function useModelLabels(input: ModelLabelInput): ModelLabels {
    const { t, i18n } = useTranslation()
    const { model, title, titleKey, newPrefix, titleOverride, newLabelOverride, singularLabel, newLabelMeta, gender } = input
    return useMemo(
        () => resolveModelLabels(t as unknown as ModelLabelT, { model, title, titleKey, newPrefix, titleOverride, newLabelOverride, singularLabel, newLabelMeta, gender }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [t, i18n?.language, model, title, titleKey, newPrefix, titleOverride, newLabelOverride, singularLabel, newLabelMeta, gender],
    )
}
