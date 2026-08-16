/**
 * Radix Dialog / AlertDialog / Sheet lock the document via
 * `@radix-ui/react-remove-scroll`, which sets `pointer-events: none` on
 * `<body>` while open. If the React tree unmounts the root WHILE still open
 * (federated modal returns null, parent remounts on list refresh, uncaught
 * error mid-close), RemoveScroll's cleanup never runs and the whole app
 * stops receiving clicks until a full reload.
 *
 * Call this after close / on unmount as a safety net. Nested open layers are
 * detected so we do not unlock while another modal is still active.
 */
export function restoreBodyInteraction(): void {
  if (typeof document === 'undefined') return

  const stillLocked = document.querySelector(
    [
      '[data-slot="dialog-overlay"][data-state="open"]',
      '[data-slot="alert-dialog-overlay"][data-state="open"]',
      '[data-slot="sheet-overlay"][data-state="open"]',
      '[role="dialog"][data-state="open"]',
      '[role="alertdialog"][data-state="open"]',
    ].join(','),
  )
  if (stillLocked) return

  const { body, documentElement } = document
  if (body.style.pointerEvents === 'none') {
    body.style.pointerEvents = ''
  }
  if (body.style.overflow === 'hidden') {
    body.style.overflow = ''
  }
  // react-remove-scroll / RemoveScroll leftover attrs
  if (body.hasAttribute('data-scroll-locked')) {
    body.removeAttribute('data-scroll-locked')
  }
  if (documentElement.hasAttribute('data-scroll-locked')) {
    documentElement.removeAttribute('data-scroll-locked')
  }
  // Padding injected to compensate for the scrollbar gutter.
  if (body.style.paddingRight) {
    body.style.paddingRight = ''
  }
}

/** Schedule a couple of unlock passes after Radix's own cleanup settles. */
export function scheduleRestoreBodyInteraction(): void {
  if (typeof window === 'undefined') return
  queueMicrotask(() => restoreBodyInteraction())
  requestAnimationFrame(() => restoreBodyInteraction())
  window.setTimeout(() => restoreBodyInteraction(), 0)
}
