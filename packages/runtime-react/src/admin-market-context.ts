import { createContext, createElement, useContext, type ReactNode } from 'react'

/**
 * Catalog market chosen for administrative browsing. Operational branch
 * consumers continue to use useActiveMarket.
 */
export type AdminMarketSelection = string | null | undefined

const AdminMarketContext = createContext<AdminMarketSelection>(undefined)

export function AdminMarketProvider({
    market,
    children,
}: {
    market: AdminMarketSelection
    children?: ReactNode
}) {
    return createElement(AdminMarketContext.Provider, { value: market }, children)
}

/** undefined means branch-derived, null means all permitted markets. */
export function useAdminMarketSelection(): AdminMarketSelection {
    return useContext(AdminMarketContext)
}
