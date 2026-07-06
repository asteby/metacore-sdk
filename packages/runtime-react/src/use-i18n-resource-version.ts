// A tiny hook that returns a version counter which bumps every time i18next's
// resource store changes (a bundle is `added`, a language `loaded`, or a key
// `removed`).
//
// Why this exists: addon i18n bundles are fetched and merged asynchronously
// (addResourceBundle) AFTER the board first paints. react-i18next only
// re-renders a `useTranslation()` consumer on a store mutation when the host
// configured `bindI18nStore` to include those events — a host-level setting the
// SDK cannot assume. Without it a lane whose label is a manifest i18n key
// (e.g. "integration_github.stage.in_progress") renders the RAW key until an
// unrelated re-render happens to re-run `t()`.
//
// Depending on this version inside a memo/render makes the component re-resolve
// its labels the moment the bundle lands, regardless of the host's
// react-i18next binding config. Self-contained and cheap: one listener per
// mounting component, torn down on unmount.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function useI18nResourceVersion(): number {
  const { i18n } = useTranslation()
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!i18n) return
    const bump = () => setVersion((v) => v + 1)
    // `added`/`removed` fire on the resource STORE (addResourceBundle);
    // `loaded` fires when a backend finishes a language; `languageChanged`
    // covers a runtime locale flip. Listening to all keeps a label correct
    // through every path a translation can arrive.
    i18n.store?.on?.('added', bump)
    i18n.store?.on?.('removed', bump)
    i18n.on?.('loaded', bump)
    i18n.on?.('languageChanged', bump)
    return () => {
      i18n.store?.off?.('added', bump)
      i18n.store?.off?.('removed', bump)
      i18n.off?.('loaded', bump)
      i18n.off?.('languageChanged', bump)
    }
  }, [i18n])
  return version
}
