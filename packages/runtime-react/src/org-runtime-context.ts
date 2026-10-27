// Org runtime contexts — thread the org's display config (timezone, currency)
// to nested field/cell/relation renderers without prop-drilling. Lives in its
// own module (mirroring `image-url-context`) so any renderer can consume them
// without importing from `dialogs/dynamic-record`. That dialog imports
// `dynamic-relations` → `dynamic-relation`, so the relation table cannot import
// these contexts back from the dialog without a circular import — hence this
// standalone module is the single source of truth.
import { createContext, useContext } from 'react'

/**
 * IANA timezone (e.g. the org's `America/Mexico_City`) used to render
 * datetime/timestamp cells. `undefined` outside a provider → renderers fall
 * back to the viewer's browser zone (legacy behaviour).
 */
export const TimeZoneContext = createContext<string | undefined>(undefined)

/** Reads the nearest org timezone (undefined outside a provider). */
export const useTimeZone = () => useContext(TimeZoneContext)

/**
 * Org ISO-4217 currency (org config, like the timezone) used as the fallback
 * for money cells/fields that don't carry an explicit per-column currency.
 * `undefined` outside a provider → renderers fall back to 'USD'.
 */
export const CurrencyContext = createContext<string | undefined>(undefined)

/** Reads the nearest org currency (undefined outside a provider). */
export const useCurrency = () => useContext(CurrencyContext)

/**
 * Org default tax rate as a fraction (e.g. `0.16`), from the org's fiscal
 * config. Document line editors use it when the picked product carries no rate
 * of its own. `undefined` outside a provider → lines start at 0.
 */
export const TaxRateContext = createContext<number | undefined>(undefined)

/** Reads the nearest org default tax rate (undefined outside a provider). */
export const useOrgTaxRate = () => useContext(TaxRateContext)

/**
 * Number-locale overrides keyed by UI language: `{ es: 'es-MX' }` makes a
 * Spanish UI format numbers and money the Mexican way (11,461.50) instead of
 * Intl's bare `'es'` (Spain: 11.461,50). Keys match the full language
 * (`'es-mx'`) first, then its base (`'es'`), case-insensitive. `undefined`
 * outside a provider → numbers use the UI language as-is (legacy behaviour).
 */
export type NumberLocales = Readonly<Record<string, string>>

export const NumberLocalesContext = createContext<NumberLocales | undefined>(undefined)

/**
 * Pure resolver: the Intl locale numbers should use for `language` given the
 * org's overrides. Returns `language` unchanged when nothing matches.
 */
export function resolveNumberLocale(
    language: string | undefined,
    locales: NumberLocales | undefined,
): string | undefined {
    if (!language || !locales) return language
    const lower = language.toLowerCase()
    const byKey = new Map(Object.entries(locales).map(([k, v]) => [k.toLowerCase(), v]))
    return byKey.get(lower) ?? byKey.get(lower.split('-')[0]) ?? language
}

/**
 * The Intl locale for number/currency formatting of the current UI language
 * (`language`, usually `i18n.language`), honouring the nearest
 * `OrgRuntimeProvider numberLocales`.
 */
export function useNumberLocale(language: string): string
export function useNumberLocale(language: string | undefined): string | undefined
export function useNumberLocale(language: string | undefined): string | undefined {
    return resolveNumberLocale(language, useContext(NumberLocalesContext))
}

/**
 * How the SYSTEM actor (records created or changed by a seed, an event, an
 * agent or an automation — `created_by` empty or `SYSTEM_ACTOR_ID`) is
 * presented: e.g. `{ name: 'Gobi', avatarUrl: '/brand/gobi.png' }`. Read by
 * creator/created_by table cells, AuditInfo, ActivityTimeline, RecordHistory
 * and the record dialog. `undefined` outside a provider → the localized
 * "Sistema"/"System" label and initials (legacy behaviour).
 */
export interface SystemActor {
    /** Display name (already localized). */
    name?: string
    /** Absolute URL or app path of the avatar image; used as-is. */
    avatarUrl?: string
}

export const SystemActorContext = createContext<SystemActor | undefined>(undefined)

/** Reads the nearest system-actor presentation (undefined outside a provider). */
export const useSystemActor = () => useContext(SystemActorContext)

/**
 * How the app's AGENT (its assistant: Gobi in Vantora) is presented when a
 * record's provenance says an agent made it or proposed it. Separate from
 * `SystemActor`: unattended platform work (seeds, imports) is not the agent.
 * `undefined` outside a provider → the provenance `actor_name`, else a
 * localized "Asistente"/"Assistant".
 */
export interface AgentActor {
    /** Display name (already localized). */
    name?: string
    /** Absolute URL or app path of the avatar image; used as-is. */
    avatarUrl?: string
}

export const AgentActorContext = createContext<AgentActor | undefined>(undefined)

/** Reads the nearest agent presentation (undefined outside a provider). */
export const useAgentActor = () => useContext(AgentActorContext)

/**
 * Host hook naming the ORIGIN of a record that has no stored provenance but
 * was clearly made by the system (null `created_by_id`): e.g. Vantora maps
 * `findings` → "Importación de investigación pública". Return `undefined` when
 * unknown — the badge then shows the system actor alone, never an invented
 * origin.
 */
export type ProvenanceOriginResolver = (
    model: string | undefined,
    row: Record<string, unknown> | null | undefined,
) => string | undefined

export const ProvenanceOriginContext = createContext<ProvenanceOriginResolver | undefined>(undefined)

/** Reads the nearest origin resolver (undefined outside a provider). */
export const useProvenanceOrigin = () => useContext(ProvenanceOriginContext)
