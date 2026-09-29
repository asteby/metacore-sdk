/**
 * macOS-style dismiss button for sonner toasts.
 *
 * Sonner only draws its own close button on non-custom, non-loading toasts,
 * and its toast `<li>` carries no toast id. So the Toaster appends a plain
 * DOM button to every `<li data-sonner-toast>` and pairs each `<li>` with its
 * toast by order: sonner renders each list newest-first, the same order
 * `useSonner()` keeps. Plain DOM (not a React portal) keeps the button inside
 * sonner's own React subtree for hover/pointer handling, so hovering it still
 * pauses auto-close.
 */

export const TOAST_CLOSE_SLOT = 'toast-close'

export type ToastCloseTarget = {
  id: string | number
  position?: string
  dismissible?: boolean
  closeButton?: boolean
  toasterId?: string
}

export type SyncToastCloseOptions = {
  label: string
  /** The Toaster's `position`; toasts without their own go there. */
  defaultPosition: string
  /** The Toaster's `id`, when several Toasters coexist. */
  toasterId?: string
  /** `<li>` → toast id pairs, kept across syncs. */
  ids: WeakMap<Element, string | number>
  onDismiss: (id: string | number) => void
}

const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

function createCloseButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.slot = TOAST_CLOSE_SLOT
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML = CLOSE_ICON
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return button
}

export function syncToastCloseButtons(
  root: ParentNode,
  toasts: readonly ToastCloseTarget[],
  opts: SyncToastCloseOptions,
): void {
  const own = toasts.filter((t) =>
    opts.toasterId ? t.toasterId === opts.toasterId : !t.toasterId,
  )

  root.querySelectorAll<HTMLElement>('[data-sonner-toaster]').forEach((list) => {
    const position = `${list.dataset.yPosition}-${list.dataset.xPosition}`
    const candidates = own.filter((t) => (t.position ?? opts.defaultPosition) === position)
    const items = Array.from(list.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-sonner-toast'),
    )

    const taken = new Set(items.map((el) => opts.ids.get(el)))
    const freeItems = items.filter((el) => !opts.ids.has(el) && el.dataset.removed !== 'true')
    const freeToasts = candidates.filter((t) => !taken.has(t.id))
    // Both sides are newest-first. When they disagree (a toast is mid-flight
    // between sonner's state and the DOM) wait for the next sync.
    if (freeItems.length === freeToasts.length) {
      freeItems.forEach((el, i) => opts.ids.set(el, freeToasts[i].id))
    }

    for (const el of items) {
      const id = opts.ids.get(el)
      const target = id === undefined ? undefined : candidates.find((t) => t.id === id)
      const existing = el.querySelector<HTMLButtonElement>(
        `:scope > [data-slot="${TOAST_CLOSE_SLOT}"]`,
      )
      if (id === undefined || !target || target.dismissible === false || target.closeButton === false) {
        existing?.remove()
        continue
      }
      if (existing) {
        if (existing.getAttribute('aria-label') !== opts.label) {
          existing.setAttribute('aria-label', opts.label)
          existing.title = opts.label
        }
        continue
      }
      el.appendChild(createCloseButton(opts.label, () => opts.onDismiss(id)))
    }
  })
}

export function removeToastCloseButtons(root: ParentNode): void {
  root
    .querySelectorAll(`[data-sonner-toast] > [data-slot="${TOAST_CLOSE_SLOT}"]`)
    .forEach((el) => el.remove())
}

const STYLE_ID = 'metacore-toast-close-styles'

const BUTTON = `[data-sonner-toast] > [data-slot='${TOAST_CLOSE_SLOT}']`
const EASE = 'var(--motion-duration-fast, 150ms) var(--motion-ease-standard, cubic-bezier(0.2, 0, 0, 1))'

/**
 * Surface, rim, elevation and blur come from @asteby/metacore-theme tokens, so
 * the glass pack and dark mode repaint it; fallbacks cover apps without them.
 */
export const TOAST_CLOSE_CSS = `
[data-sonner-toaster] { --mc-toast-close-x: -40%; }
[data-sonner-toaster][dir='rtl'] { --mc-toast-close-x: 40%; }
${BUTTON} {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border-radius: 9999px;
  border: 1px solid var(--border-rim, var(--border, rgb(0 0 0 / 0.12)));
  background: color-mix(in oklab, var(--popover, #fff) 82%, transparent);
  color: var(--popover-foreground, #111);
  box-shadow: var(--elevation-raised, 0 0 #0000), 0 1px 3px rgb(0 0 0 / 0.14);
  -webkit-backdrop-filter: var(--backdrop-panel, blur(12px) saturate(1.6));
  backdrop-filter: var(--backdrop-panel, blur(12px) saturate(1.6));
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translate(var(--mc-toast-close-x), -40%) scale(0.85);
  transition: opacity ${EASE}, transform ${EASE}, background-color ${EASE};
}
${BUTTON}:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translate(var(--mc-toast-close-x), -40%) scale(1);
  outline: 2px solid var(--ring, currentColor);
  outline-offset: 1px;
}
[data-sonner-toast]:hover > [data-slot='${TOAST_CLOSE_SLOT}'],
[data-sonner-toast]:focus-visible > [data-slot='${TOAST_CLOSE_SLOT}'],
[data-sonner-toast]:focus-within > [data-slot='${TOAST_CLOSE_SLOT}'] {
  opacity: 1;
  pointer-events: auto;
  transform: translate(var(--mc-toast-close-x), -40%) scale(1);
}
${BUTTON}:hover {
  background: color-mix(in oklab, var(--popover, #fff) 70%, var(--popover-foreground, #111) 10%);
}
@media (hover: none) {
  ${BUTTON} {
    opacity: 1;
    pointer-events: auto;
    transform: translate(var(--mc-toast-close-x), -40%) scale(1);
  }
}
[data-sonner-toast][data-expanded='false'][data-front='false'] > [data-slot='${TOAST_CLOSE_SLOT}'],
[data-sonner-toast][data-removed='true'] > [data-slot='${TOAST_CLOSE_SLOT}'] {
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  ${BUTTON} { transition: none; }
}
`

export function ensureToastCloseStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TOAST_CLOSE_CSS
  document.head.appendChild(style)
}
