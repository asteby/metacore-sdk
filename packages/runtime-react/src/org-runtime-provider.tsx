// OrgRuntimeProvider — one place to feed the org's display config (timezone,
// currency, image-url resolver) to EVERY nested SDK renderer: dynamic tables,
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
import { CurrencyContext, TimeZoneContext } from './org-runtime-context'

export interface OrgRuntimeProviderProps {
  /** Org IANA timezone (e.g. `America/Mexico_City`). */
  timeZone?: string
  /** Org ISO-4217 currency (e.g. `MXN`). */
  currency?: string
  /** Resolver turning a stored path into a fetchable URL. Defaults to identity. */
  getImageUrl?: GetImageUrl
  children: ReactNode
}

export function OrgRuntimeProvider({
  timeZone,
  currency,
  getImageUrl = identityImageUrl,
  children,
}: OrgRuntimeProviderProps) {
  return (
    <ImageUrlContext.Provider value={getImageUrl}>
      <TimeZoneContext.Provider value={timeZone}>
        <CurrencyContext.Provider value={currency}>
          {children}
        </CurrencyContext.Provider>
      </TimeZoneContext.Provider>
    </ImageUrlContext.Provider>
  )
}
