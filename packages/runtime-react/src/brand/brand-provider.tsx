import { useMemo, type ReactNode } from 'react'
import { BrandContext, normalizeBrand, type Brand } from './context'
import { BrandDocumentSync } from './brand-document-sync'

export interface BrandProviderProps {
    /** Marca a exponer. Los campos ausentes quedan vacíos. */
    value: Partial<Brand> | null | undefined
    /** Monta `<BrandDocumentSync />` (título, favicon, variables CSS). Default false. */
    syncDocument?: boolean
    children?: ReactNode
}

export function BrandProvider({ value, syncDocument = false, children }: BrandProviderProps) {
    const v = value ?? undefined
    const brand = useMemo(
        () => normalizeBrand(v),
        // Por campos: un `value` literal nuevo en cada render no re-renderiza a los consumidores.
        [v?.name, v?.logo, v?.favicon, v?.primaryColor, v?.accentColor, v?.mascotName, v?.locked, v?.source],
    )
    return (
        <BrandContext.Provider value={brand}>
            {syncDocument && <BrandDocumentSync />}
            {children}
        </BrandContext.Provider>
    )
}
