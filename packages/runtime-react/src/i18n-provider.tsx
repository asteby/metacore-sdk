// I18nProvider — merges `manifest.i18n` resources from every loaded addon
// into the host's i18next instance. The host passes the i18n instance; this
// component just hydrates new namespaces and keeps them live.
import { useEffect } from 'react'
import type { i18n as I18nInstance } from 'i18next'

export interface AddonI18nResources {
    /** Addon key — used as the i18next namespace. */
    source: string
    /** Map of locale → key/value tree. */
    resources: Record<string, Record<string, any>>
}

export interface I18nProviderProps {
    /** The host's i18next instance. */
    i18n: I18nInstance
    /** All addon translations contributed via `manifest.i18n`. */
    contributions: AddonI18nResources[]
    children: React.ReactNode
}

export function I18nProvider({ i18n, contributions, children }: I18nProviderProps) {
    useEffect(() => {
        for (const c of contributions) {
            for (const [locale, tree] of Object.entries(c.resources)) {
                // addBundle(locale, namespace, resources, deep?, overwrite?)
                i18n.addResourceBundle(locale, c.source, tree, true, false)
            }
        }
    }, [i18n, contributions])

    return <>{children}</>
}
