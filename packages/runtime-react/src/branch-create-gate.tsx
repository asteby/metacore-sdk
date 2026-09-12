/**
 * Optional host gate for stamping `branch_id` on creates when the sidebar is
 * on "all branches" (no active scope).
 *
 * Ops (and other hosts) provide a provider that opens a confirm + branch
 * picker. The SDK's DynamicRecordDialog / ActionModalDispatcher call
 * `ensureBranchForCreate` right before POST — custom federated modals can use
 * the same hook so POS-style flows stay consistent.
 *
 * Return contract for `ensureBranchForCreate`:
 *   - `undefined` — model has no branch_id / gate not needed / already scoped
 *   - `string`    — branch id to stamp onto the payload
 *   - `null`      — user cancelled the picker (abort submit)
 */
import { createContext, useContext, type ReactNode } from 'react'

export type BranchCreateGateApi = {
  ensureBranchForCreate: (model: string) => Promise<string | null | undefined>
}

const BranchCreateGateContext = createContext<BranchCreateGateApi | null>(null)

export function BranchCreateGateProvider({
  value,
  children,
}: {
  value: BranchCreateGateApi
  children: ReactNode
}) {
  return (
    <BranchCreateGateContext.Provider value={value}>
      {children}
    </BranchCreateGateContext.Provider>
  )
}

/** Hook for custom / federated create modals. Returns null when no host gate. */
export function useBranchCreateGate(): BranchCreateGateApi | null {
  return useContext(BranchCreateGateContext)
}
