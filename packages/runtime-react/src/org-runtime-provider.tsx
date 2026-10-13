// OrgRuntimeProvider — one place to feed the org's display config (timezone,
// currency, number locale, image-url resolver) to EVERY nested SDK renderer: dynamic tables,
// relation tables, record dialogs and field cells all read these via context.
// The record dialog provides them locally, but standalone surfaces (the
// full-page detail view, any table mounted outside a dialog) had no provider,
// so money fell back to USD and datetimes to the browser zone. Wrap the
// authenticated app root once and the whole app becomes org-consistent.
import { type ReactNode } from 'react'

import {
  ImageUrlContext,
  identityImageUrl,
  type GetImageUrl,
} from './image-url-context'
import {
  CurrencyContext,
  NumberLocalesContext,
  SystemActorContext,
  TaxRateContext,
  TimeZoneContext,
  type NumberLocales,
  type SystemActor,
} from './org-runtime-context'

export interface OrgRuntimeProviderProps {
  /** Org IANA timezone (e.g. `America/Mexico_City`). */
  timeZone?: string
  /** Org ISO-4217 currency (e.g. `MXN`). */
  currency?: string
  /** Org default tax rate as a fraction (e.g. `0.16`) for document lines. */
  taxRate?: number
  /**
   * Number-locale overrides by UI language, e.g. `{ es: 'es-MX' }` so a
   * Spanish UI formats numbers and money as Mexico does (11,461.50). Applies
   * to table cells and footers, kanban cards and lane totals, and the record
   * dialog. Omit to format with the UI language as-is.
   */
  numberLocales?: NumberLocales
  /**
   * Presentation of the system actor (name + avatar) wherever a record shows
   * who created/changed it and nobody did — e.g. `{ name: 'Gobi' }`.
   */
  systemActor?: SystemActor
  /** Resolver turning a stored path into a fetchable URL. Defaults to identity. */
  getImageUrl?: GetImageUrl
  children: ReactNode
}

export function OrgRuntimeProvider({
  timeZone,
  currency,
  taxRate,
  numberLocales,
  systemActor,
  getImageUrl = identityImageUrl,
  children,
}: OrgRuntimeProviderProps) {
  return (
    <ImageUrlContext.Provider value={getImageUrl}>
      <TimeZoneContext.Provider value={timeZone}>
        <CurrencyContext.Provider value={currency}>
          <TaxRateContext.Provider value={taxRate}>
            <NumberLocalesContext.Provider value={numberLocales}>
              <SystemActorContext.Provider value={systemActor}>
                {children}
              </SystemActorContext.Provider>
            </NumberLocalesContext.Provider>
          </TaxRateContext.Provider>
        </CurrencyContext.Provider>
      </TimeZoneContext.Provider>
    </ImageUrlContext.Provider>
  )
}
