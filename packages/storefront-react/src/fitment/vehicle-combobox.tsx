// Selector con búsqueda para «Mi vehículo» (marca, modelo, año): patrón ARIA combobox + listbox, con logo de la marca
// en cada opción y en el campo, rejilla de marcas populares arriba y hoja inferior en móvil. Mejora progresiva: sin
// JavaScript (y en el HTML del servidor) es un <select> nativo con el mismo id y name; al hidratar el <select> queda
// oculto pero en el formulario (sigue enviando su valor) y la interacción pasa al combobox.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { VehicleMakeLogo } from './vehicle-make-logo.js'

export type VehicleComboboxOption = { value: string; label: string }

export type VehicleComboboxClassNames = {
  /** Botón que abre la lista (el «campo» visible). */
  trigger?: string
  /** Panel desplegable (y hoja inferior en móvil). */
  panel?: string
  /** Buscador dentro del panel. */
  search?: string
  /** Cada opción de la lista; la activa lleva `data-active`, la elegida `aria-selected="true"`. */
  option?: string
  /** Rejilla de marcas populares y cada botón suyo. */
  grid?: string
  gridItem?: string
  /** Rótulos pequeños («Marcas populares», «Todas»). */
  heading?: string
  /** Velo de la hoja inferior en móvil. */
  backdrop?: string
}

export type VehicleComboboxProps = {
  /** id del campo: el <label htmlFor> de la tienda apunta aquí antes y después de hidratar. */
  id: string
  /** name del <select> nativo (envío del formulario). */
  name?: string
  /** Nombre accesible del campo («Marca»). */
  label: string
  value: string
  onChange: (value: string) => void
  options: VehicleComboboxOption[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Muestra el logo de la marca (por `label`) en cada opción y en el campo. Para «Marca»; no para modelo o año. */
  logos?: boolean
  /** Carpeta pública de los logos (por omisión `/vehicle-makes`). */
  logoBase?: string
  /** Valores a mostrar arriba como rejilla de logos («Marcas populares»), en ese orden. */
  popular?: string[]
  popularLabel?: string
  /** Buscador dentro del panel; por omisión, cuando hay más de 8 opciones. */
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  /** Clase del <select> nativo (antes de hidratar o sin JavaScript). */
  nativeClassName?: string
  classNames?: VehicleComboboxClassNames
  /** Ancho mínimo del panel en escritorio (px; por omisión el del campo, mínimo 280). */
  panelMinWidth?: number
  /** Media query de la hoja inferior (por omisión `(max-width: 639px)`). */
  sheetQuery?: string
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

function useHydrated() {
  const [h, setH] = useState(false)
  useEffect(() => setH(true), [])
  return h
}

function useMedia(query: string, enabled: boolean) {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [query, enabled])
  return match
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * Combobox de «Mi vehículo». Teclado: ↓/↑/Enter/Espacio abren; dentro, ↓/↑/Inicio/Fin mueven, Enter elige, Esc cierra
 * y devuelve el foco al campo, Tab cierra. Escribir con el campo enfocado abre y busca (type-ahead).
 */
export function VehicleCombobox({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder = 'Elige…',
  disabled = false,
  required = false,
  logos = false,
  logoBase,
  popular,
  popularLabel = 'Populares',
  searchable,
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  nativeClassName,
  classNames = {},
  panelMinWidth = 280,
  sheetQuery = '(max-width: 639px)',
}: VehicleComboboxProps) {
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const uid = useId()
  const listId = `${uid}-list`
  const optId = (i: number) => `${uid}-opt-${i}`
  const sheet = useMedia(sheetQuery, open)
  const canSearch = searchable ?? options.length > 8

  const current = options.find((o) => o.value === value) ?? null
  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return options
    const starts = options.filter((o) => norm(o.label).startsWith(q))
    const rest = options.filter((o) => !norm(o.label).startsWith(q) && norm(o.label).includes(q))
    return [...starts, ...rest]
  }, [options, query])
  const popularOptions = useMemo(
    () => (popular ?? []).map((v) => options.find((o) => o.value === v)).filter((o): o is VehicleComboboxOption => !!o),
    [popular, options],
  )

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false)
    setQuery('')
    if (focusTrigger) requestAnimationFrame(() => trigger.current?.focus())
  }, [])

  const openList = (seed = '') => {
    if (disabled) return
    setQuery(seed)
    const idx = seed ? 0 : Math.max(0, options.findIndex((o) => o.value === value))
    setActive(idx)
    setOpen(true)
  }

  const choose = (v: string) => {
    close(true)
    if (v !== value) onChange(v)
  }

  // Foco al abrir: buscador (si hay) o la lista.
  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => (canSearch ? searchRef.current : listRef.current)?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, canSearch])

  // Clic fuera cierra (en escritorio; la hoja tiene su velo).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  // La hoja inferior bloquea el desplazamiento del fondo.
  useEffect(() => {
    if (!open || !sheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, sheet])

  // La opción activa siempre a la vista.
  useEffect(() => {
    if (!open) return
    document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open])

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      openList()
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      if (canSearch) openList(e.key)
      else {
        const i = options.findIndex((o) => norm(o.label).startsWith(norm(e.key)))
        openList()
        if (i >= 0) setActive(i)
      }
    }
  }

  const onListKey = (e: KeyboardEvent) => {
    const last = filtered.length - 1
    const go = (i: number) => {
      e.preventDefault()
      setActive(Math.max(0, Math.min(last, i)))
    }
    if (e.key === 'ArrowDown') go(active + 1)
    else if (e.key === 'ArrowUp') go(active - 1)
    else if (e.key === 'Home' && !canSearch) go(0)
    else if (e.key === 'End' && !canSearch) go(last)
    else if (e.key === 'PageDown') go(active + 8)
    else if (e.key === 'PageUp') go(active - 8)
    else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = filtered[active]
      if (picked) choose(picked.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (!canSearch && e.key.length === 1 && /\S/.test(e.key)) {
      const i = filtered.findIndex((o) => norm(o.label).startsWith(norm(e.key)))
      if (i >= 0) go(i)
    }
  }

  const native = (
    <select
      id={hydrated ? undefined : id}
      name={name}
      value={value}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={nativeClassName}
      {...(hydrated ? { tabIndex: -1, 'aria-hidden': true, style: visuallyHidden } : {})}
    >
      <option value="" disabled={required}>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )

  if (!hydrated) return native

  const panelStyle: CSSProperties = sheet
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, maxHeight: '85dvh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)' }
    : { position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, minWidth: `max(100%, ${panelMinWidth}px)`, maxHeight: 420, display: 'flex', flexDirection: 'column' }

  return (
    <div
      ref={root}
      style={{ position: 'relative' }}
      data-vehicle-combobox=""
      onBlur={(e) => {
        // El foco salió del combobox (Tab fuera del panel): se cierra sin robar el foco.
        if (open && !root.current?.contains(e.relatedTarget as Node | null)) close(false)
      }}
    >
      {native}
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
        className={classNames.trigger}
        data-filled={current ? '' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}
      >
        {logos && current ? <VehicleMakeLogo make={current.label} size={22} base={logoBase} loading="eager" /> : null}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label ?? placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          {sheet ? <div className={classNames.backdrop} data-vehicle-combobox-backdrop="" onClick={() => close(true)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} /> : null}
          <div className={classNames.panel} data-vehicle-combobox-panel={sheet ? 'sheet' : 'popover'} style={panelStyle} onKeyDown={onListKey}>
            {sheet ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px 4px' }}>
                <span className={classNames.heading}>{label}</span>
                <button type="button" onClick={() => close(true)} aria-label="Cerrar" style={{ minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : null}
            {canSearch ? (
              <div style={{ padding: sheet ? '4px 16px 8px' : 8 }}>
                <input
                  ref={searchRef}
                  type="search"
                  role="combobox"
                  aria-label={`Buscar ${label.toLowerCase()}`}
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={filtered[active] ? optId(active) : undefined}
                  autoComplete="off"
                  enterKeyHint="go"
                  value={query}
                  placeholder={searchPlaceholder}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActive(0)
                  }}
                  className={classNames.search}
                  style={{ width: '100%' }}
                />
              </div>
            ) : null}
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: sheet ? '0 16px 16px' : '0 8px 8px' }}>
              {!query && popularOptions.length > 0 ? (
                <div data-vehicle-combobox-popular="">
                  <p className={classNames.heading} style={{ margin: '4px 0 8px' }}>
                    {popularLabel}
                  </p>
                  <div className={classNames.grid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {popularOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => choose(o.value)}
                        aria-pressed={o.value === value}
                        className={classNames.gridItem}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minHeight: 44, padding: '8px 4px' }}
                      >
                        {logos ? <VehicleMakeLogo make={o.label} size={36} base={logoBase} /> : null}
                        <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={label}
                tabIndex={canSearch ? -1 : 0}
                aria-activedescendant={!canSearch && filtered[active] ? optId(active) : undefined}
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {filtered.length === 0 ? (
                  <li role="presentation" style={{ padding: '12px 8px', opacity: 0.75 }}>
                    {emptyText}
                  </li>
                ) : (
                  filtered.map((o, i) => (
                    <li
                      key={o.value}
                      id={optId(i)}
                      role="option"
                      aria-selected={o.value === value}
                      data-active={i === active || undefined}
                      onPointerMove={() => setActive(i)}
                      // Sin robar el foco al buscador: si no, el blur cerraría el panel antes del clic.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o.value)}
                      className={classNames.option}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}
                    >
                      {logos ? <VehicleMakeLogo make={o.label} size={28} base={logoBase} /> : null}
                      <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                      {o.value === value ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
