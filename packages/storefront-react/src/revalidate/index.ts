/**
 * Revalidación de React Router para tiendas: cuándo NO volver a pedir a OPS lo que una acción no puede haber cambiado.
 *
 * Tras cada acción (agregar, sumar o restar en el carrito, boletín) el router vuelve a correr los loaders de la ruta
 * activa. En una ficha de producto eso repite las recomendaciones, reseñas y disponibilidad (~1 s) solo para volver a
 * pintar lo mismo, y es lo que hacía lento el «+/−» del mini-carrito. El carrito lo recarga `root`, que sí se
 * revalida. Una sola implementación para todas las tiendas: cada una declara qué acciones son «del carrito».
 *
 * Los tipos son estructurales (compatibles con `ShouldRevalidateFunctionArgs` de React Router): el paquete no depende
 * del router.
 */

export type RevalidateArgs = {
  formAction?: string | undefined
  formMethod?: string | undefined
  currentUrl: URL
  nextUrl: URL
  defaultShouldRevalidate: boolean
}

export type StoreRevalidation = {
  /**
   * Para las rutas de catálogo y contenido (ficha, colección, blog, páginas): una acción de `skipActions` no cambia lo
   * que muestran, así que no se vuelven a pedir.
   */
  skipOnCartAction: (args: RevalidateArgs) => boolean
  /**
   * Para `root`: filtrar, ordenar o paginar el catálogo solo cambia la query de la misma ruta y no toca tienda, tema,
   * menús ni carrito, así que no se vuelven a pedir. Acciones, cambios de ruta y `revalidate()` explícito siguen la
   * regla por omisión.
   */
  skipOnSearchOnlyChange: (args: RevalidateArgs) => boolean
}

/**
 * @param skipActions Rutas de las acciones que no cambian el contenido de catálogo, ya con el prefijo del mercado de la
 * petición (p. ej. `() => [paths.cart(), paths.newsletter()]`). Se evalúa en cada decisión.
 */
export function createStoreRevalidation(opts: { skipActions: () => ReadonlyArray<string | null | undefined> }): StoreRevalidation {
  return {
    skipOnCartAction({ formAction, defaultShouldRevalidate }) {
      if (formAction && opts.skipActions().includes(formAction)) return false
      return defaultShouldRevalidate
    },
    skipOnSearchOnlyChange({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) {
      if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false
      return defaultShouldRevalidate
    },
  }
}
