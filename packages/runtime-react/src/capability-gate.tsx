// CapabilityGate — conditionally renders its children based on the current
// user's capability set. Capabilities are sourced from AddonAPI.capabilities
// or a React context the host provides.
import React, { createContext, useContext, useMemo } from 'react'

export type CapabilitySet = ReadonlySet<string> | string[] | Record<string, boolean>

interface CapabilityContextValue {
    has: (capability: string) => boolean
    all: (capabilities: string[]) => boolean
    any: (capabilities: string[]) => boolean
}

const CapabilityContext = createContext<CapabilityContextValue>({
    has: () => false,
    all: () => false,
    any: () => false,
})

export interface CapabilityProviderProps {
    capabilities: CapabilitySet
    children: React.ReactNode
}

function normalize(cs: CapabilitySet): Set<string> {
    if (cs instanceof Set) return cs as Set<string>
    if (Array.isArray(cs)) return new Set(cs)
    return new Set(Object.entries(cs).filter(([, v]) => v).map(([k]) => k))
}

export function CapabilityProvider({ capabilities, children }: CapabilityProviderProps) {
    const value = useMemo<CapabilityContextValue>(() => {
        const set = normalize(capabilities)
        return {
            has: (c) => set.has(c),
            all: (cs) => cs.every(c => set.has(c)),
            any: (cs) => cs.some(c => set.has(c)),
        }
    }, [capabilities])
    return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>
}

export function useCapabilities() {
    return useContext(CapabilityContext)
}

export interface CapabilityGateProps {
    /** Single capability required to render children. */
    require?: string
    /** All of these capabilities must be present. */
    all?: string[]
    /** At least one of these capabilities must be present. */
    any?: string[]
    /** Content rendered when the user lacks the required capabilities. */
    fallback?: React.ReactNode
    /** Optional negation: render children when capability is ABSENT. */
    invert?: boolean
    children: React.ReactNode
}

export function CapabilityGate({ require, all, any, fallback = null, invert = false, children }: CapabilityGateProps) {
    const ctx = useCapabilities()
    let allowed = true
    if (require) allowed = allowed && ctx.has(require)
    if (all && all.length) allowed = allowed && ctx.all(all)
    if (any && any.length) allowed = allowed && ctx.any(any)
    const show = invert ? !allowed : allowed
    return <>{show ? children : fallback}</>
}
