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
