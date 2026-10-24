import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

// Estado mínimo del cajón del carrito, fuera de React: cualquier parte de la tienda (cabecera, tarjeta, ficha)
// lo abre sin pasar props. Es del navegador; en el servidor siempre está cerrado.

let isOpen = false
const listeners = new Set<() => void>()

let quietOpen = false

/** Marca que el cajón lo abrió una acción optimista (la apertura no mueve el foco al botón de cierre). */
export function setQuietOpen(next: boolean) {
  quietOpen = next
}

export function isQuietOpen() {
  return quietOpen
}

function set(next: boolean) {
  if (isOpen === next) return
  isOpen = next
  if (!next) quietOpen = false
  for (const l of [...listeners]) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Abre el cajón del carrito desde cualquier parte. */
export function openCartDrawer() {
  set(true)
}

/** Cierra el cajón del carrito. */
export function closeCartDrawer() {
  set(false)
}

export function toggleCartDrawer() {
  set(!isOpen)
}

export function isCartDrawerOpen() {
  return isOpen
}

/** Estado y acciones del cajón. `open` es `false` en el servidor y en la primera pintura. */
export function useCartDrawer() {
  const open = useSyncExternalStore(subscribe, () => isOpen, () => false)
  const toggle = useCallback(() => toggleCartDrawer(), [])
  return { open, openDrawer: openCartDrawer, closeDrawer: closeCartDrawer, toggle }
}

/**
 * Abre el cajón cuando termina un "agregar al carrito". `busy` es verdadero mientras hay un agregado en vuelo
 * (en React Router: algún fetcher con la acción del carrito e intención de agregar). Con `skip` verdadero al
 * terminar (error, agregado silencioso) no se abre.
 */
export function useOpenCartDrawerWhenDone(busy: boolean, options: { skip?: boolean } = {}) {
  const was = useRef(false)
  const skip = useRef(false)
  skip.current = !!options.skip
  useEffect(() => {
    if (was.current && !busy && !skip.current) openCartDrawer()
    was.current = busy
  }, [busy])
}

type ClickLike = {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  preventDefault: () => void
}

/**
 * `onClick` para el enlace "Mi carrito" de la cabecera: con un clic normal abre el cajón; con clic con
 * modificador, clic central o sin JavaScript el `href` (la página del carrito) sigue funcionando.
 */
export function handleCartLinkClick(e: ClickLike) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  openCartDrawer()
}
