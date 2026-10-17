import {
  useEffect,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode,
} from 'react'
import { formatMoney, type Money, type ShopBranch } from '@asteby/storefront'
import { directionsUrl, openStatus, type GeoPoint, type OpeningHours, type OpenStatus as OpenStatusData } from '@asteby/storefront/geo'
import { useOptionalStorefront } from './context.js'
import { useGeolocation } from './geolocation.js'
import { SELECTED_LOCATION_PARAM } from './selected-location.js'

// Headless: no styles and no class names. Every component renders `null` when there are no branches.

const EMPTY: readonly ShopBranch[] = []

/** `locations` prop, else `shop.branches` from the provider, else none. */
function useLocationsOrShop<L extends ShopBranch>(locations: readonly L[] | undefined): readonly L[] {
  const sf = useOptionalStorefront()
  return locations ?? ((sf?.shop?.branches ?? EMPTY) as readonly L[])
}

// ---------------------------------------------------------------------------
// LocationList
// ---------------------------------------------------------------------------

export type LocationItemState = { index: number; selected: boolean }

export type LocationListProps<L extends ShopBranch = ShopBranch> = {
  locations?: readonly L[]
  /** Marks one item with `data-selected` / `aria-current`. */
  selectedId?: string | null
  /** Renders each item's content. Defaults to name and address. */
  children?: (location: L, state: LocationItemState) => ReactNode
} & Omit<ComponentPropsWithoutRef<'ul'>, 'children'>

/** `<ul>` of branches; the content of every `<li>` is yours (render prop). */
export function LocationList<L extends ShopBranch = ShopBranch>({ locations, selectedId, children, ...rest }: LocationListProps<L>) {
  const list = useLocationsOrShop(locations)
  if (!list.length) return null
  return (
    <ul {...rest}>
      {list.map((loc, index) => {
        const selected = loc.id === selectedId
        return (
          <li key={loc.id} data-selected={selected || undefined} aria-current={selected || undefined}>
            {children ? children(loc, { index, selected }) : (
              <>
                <span>{loc.name}</span> <span>{loc.address}</span>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// LocationPicker
// ---------------------------------------------------------------------------

export type LocationPickerProps<L extends ShopBranch = ShopBranch> = {
  /** Accessible name of the group (rendered as `<legend>`). */
  legend: ReactNode
  locations?: readonly L[]
  /** Controlled value (branch id). */
  value?: string | null
  defaultValue?: string | null
  onChange?: (id: string, location: L) => void
  /** Radio `name` (default `sucursal`, the same param `useSelectedLocation` reads). */
  name?: string
  /** Content of each option next to its radio. Defaults to name and address. */
  children?: (location: L, state: { checked: boolean }) => ReactNode
} & Omit<ComponentPropsWithoutRef<'fieldset'>, 'children' | 'onChange' | 'defaultValue'>

/**
 * `<fieldset>` of native radio buttons: keyboard and screen-reader behaviour comes from the browser, and inside
 * a GET `<form>` it submits `?sucursal=<id>` without JavaScript.
 */
export function LocationPicker<L extends ShopBranch = ShopBranch>({
  legend, locations, value, defaultValue = null, onChange, name = SELECTED_LOCATION_PARAM, children, ...rest
}: LocationPickerProps<L>) {
  const list = useLocationsOrShop(locations)
  const [inner, setInner] = useState<string | null>(defaultValue)
  if (!list.length) return null
  const current = value !== undefined ? value : inner
  return (
    <fieldset {...rest}>
      <legend>{legend}</legend>
      {list.map((loc) => {
        const checked = loc.id === current
        return (
          <label key={loc.id} data-checked={checked || undefined}>
            <input
              type="radio"
              name={name}
              value={loc.id}
              checked={checked}
              onChange={() => {
                if (value === undefined) setInner(loc.id)
                onChange?.(loc.id, loc)
              }}
            />{' '}
            {children ? children(loc, { checked }) : (
              <>
                <span>{loc.name}</span> <span>{loc.address}</span>
              </>
            )}
          </label>
        )
      })}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// OpenStatus
// ---------------------------------------------------------------------------

export type OpenStatusLabels = { open: string; closed: string }

export type OpenStatusProps = {
  /** Reads `opening_hours` and `timezone` from it. */
  location?: Pick<ShopBranch, 'opening_hours' | 'timezone'>
  hours?: OpeningHours
  /** IANA zone (default: the branch's, else `America/Mexico_City`). */
  timezone?: string
  /** Fixed instant, for tests and SSR snapshots. Without it the status is computed after mount and refreshed every minute. */
  now?: Date
  labels?: Partial<OpenStatusLabels>
  children?: (status: OpenStatusData) => ReactNode
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>

const DEFAULT_TZ = 'America/Mexico_City'

/**
 * "Abierto" / "Cerrado" from `openStatus`. The clock makes server and client disagree, so without `now` it
 * renders nothing until mounted. Renders `null` without hours or with an unknown time zone.
 */
export function OpenStatus({ location, hours, timezone, now, labels, children, ...rest }: OpenStatusProps) {
  const h = hours ?? location?.opening_hours
  const tz = timezone ?? location?.timezone ?? DEFAULT_TZ
  const [tick, setTick] = useState<Date | null>(null)
  useEffect(() => {
    if (now) return
    setTick(new Date())
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => clearInterval(t)
  }, [now])
  const at = now ?? tick
  if (!h || !at) return null
  let status: OpenStatusData
  try {
    status = openStatus(h, tz, at)
  } catch {
    return null // RangeError: unknown time zone
  }
  const text = { open: 'Abierto', closed: 'Cerrado', ...labels }
  return (
    <span data-state={status.open ? 'open' : 'closed'} {...rest}>
      {children ? children(status) : status.open ? text.open : text.closed}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DirectionsLink
// ---------------------------------------------------------------------------

export type DirectionsLinkProps = {
  location: Pick<ShopBranch, 'lat' | 'lng' | 'address' | 'city'>
  provider?: 'google' | 'apple' | 'geo'
  children?: ReactNode
} & Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'children'>

/** Link to directions in the maps app. `null` when the branch has neither coordinates nor address. */
export function DirectionsLink({ location, provider, children = 'Cómo llegar', ...rest }: DirectionsLinkProps) {
  const href = directionsUrl(location, provider ? { provider } : {})
  if (!href) return null
  return (
    <a target="_blank" rel="noopener noreferrer" {...rest} href={href}>
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// PickupOption
// ---------------------------------------------------------------------------

export type PickupInfo<L extends ShopBranch = ShopBranch> = {
  location: L
  /** `null` = free. Amount as sent by OPS; nothing is calculated here. */
  fee: Money | null
  free: boolean
  /** Formatted `fee` (`null` when free). */
  feeText: string | null
  prepDays: number
}

export type PickupOptionProps<L extends ShopBranch = ShopBranch> = {
  location: L
  locale?: string
  children?: (info: PickupInfo<L>) => ReactNode
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>

const readyText = (days: number) => (days <= 0 ? 'listo hoy' : days === 1 ? 'listo en 1 día' : `listo en ${days} días`)

/** "Recoge en sucursal" terms: fee and preparation time. `null` when the branch does not offer pickup. */
export function PickupOption<L extends ShopBranch = ShopBranch>({ location, locale, children, ...rest }: PickupOptionProps<L>) {
  const sf = useOptionalStorefront()
  const p = location.pickup
  if (!p?.enabled) return null
  const free = !p.fee || Number(p.fee.amount) === 0
  const feeText = free ? null : formatMoney(p.fee!, locale ?? sf?.locale)
  const info: PickupInfo<L> = { location, fee: free ? null : p.fee, free, feeText, prepDays: p.prep_days }
  return (
    <span {...rest}>
      {children ? children(info) : `Recoge en sucursal · ${free ? 'gratis' : feeText} · ${readyText(p.prep_days)}`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// NearestLocationForm
// ---------------------------------------------------------------------------

export type NearestLocationFormLabels = { postalCode: string; submit: string; locate: string; locating: string }

export type NearestLocationFormProps<L extends ShopBranch = ShopBranch> = {
  locations?: readonly L[]
  /** Destination of the GET (default: the current page). */
  action?: string
  /** Query param and input name (default `cp`). */
  name?: string
  defaultValue?: string
  /** With JavaScript: intercept the submit and receive the postal code. Without it the browser navigates to `?cp=`. */
  onSubmitPostalCode?: (postalCode: string, event: FormEvent<HTMLFormElement>) => void
  /** Shows a "use my location" button (only when the browser supports it); it asks permission on click. */
  onLocate?: (point: GeoPoint) => void
  labels?: Partial<NearestLocationFormLabels>
} & Omit<ComponentPropsWithoutRef<'form'>, 'action' | 'method' | 'onSubmit' | 'defaultValue'>

/**
 * `<form method="get">` with a postal-code field: works without JavaScript (navigates to `?cp=06000`). Add
 * `onSubmitPostalCode` / `onLocate` to enhance it. Renders `null` when there are no branches.
 */
export function NearestLocationForm<L extends ShopBranch = ShopBranch>({
  locations, action, name = 'cp', defaultValue, onSubmitPostalCode, onLocate, labels, children, ...rest
}: NearestLocationFormProps<L>) {
  const list = useLocationsOrShop(locations)
  const id = useId()
  const geo = useGeolocation()
  if (!list.length) return null
  const text = { postalCode: 'Código postal', submit: 'Buscar sucursales', locate: 'Usar mi ubicación', locating: 'Buscando…', ...labels }
  return (
    <form
      method="get"
      {...(action !== undefined ? { action } : {})}
      {...rest}
      onSubmit={onSubmitPostalCode ? (e) => {
        e.preventDefault()
        const value = new FormData(e.currentTarget).get(name)
        onSubmitPostalCode(typeof value === 'string' ? value.trim() : '', e)
      } : undefined}
    >
      <label htmlFor={id}>{text.postalCode}</label>{' '}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        pattern="[0-9]{5}"
        maxLength={5}
        required
        {...(defaultValue !== undefined ? { defaultValue } : {})}
      />{' '}
      <button type="submit">{text.submit}</button>
      {onLocate && geo.supported && (
        <button
          type="button"
          disabled={geo.status === 'locating'}
          onClick={() => void geo.request().then((p) => p && onLocate(p))}
        >
          {geo.status === 'locating' ? text.locating : text.locate}
        </button>
      )}
      {geo.error && <span role="alert">{geo.error.message}</span>}
      {children}
    </form>
  )
}
