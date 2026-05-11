// Phase A1: lib utilities (12 files)
export * from './lib'

// Phase A2: shadcn/ui primitives (36 files)
export * from './components/ui'

// Phase A3 — addon route helpers. AddonRoute closes the host side of
// RFC-0001 D1 (immersive layout) by reading the runtime-react addon
// layout context and either rendering the app shell or stripping it.
export { AddonRoute, type AddonRouteProps } from './components/AddonRoute'
