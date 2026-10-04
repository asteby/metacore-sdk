import { useEffect, useState } from 'react'

const OPEN_MODAL = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

/** True when a Radix dialog / alert dialog is currently open in the document. */
export function hasOpenModal(root: ParentNode | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  return !!root?.querySelector(OPEN_MODAL)
}

/**
 * Tracks whether any modal is open. System prompts (install, update, news,
 * push permission) must not float over a form the user is filling in: they
 * hold back while this is true and come back when the modal closes.
 */
export function useModalOpen(): boolean {
  const [open, setOpen] = useState(() => hasOpenModal())
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
    const sync = () => setOpen(hasOpenModal())
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
    return () => obs.disconnect()
  }, [])
  return open
}
