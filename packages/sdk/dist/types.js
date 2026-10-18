/**
 * Manifest types for the metacore SDK.
 *
 * The CANONICAL contract is Module Contract v3 — the SDK toolchain emits v3
 * manifests (`apiVersion: "asteby.com/v3"`) and the types below re-export the
 * tygo-generated v3 shapes from ./generated/manifest-v3.ts. Re-generate the
 * generated files with: pnpm codegen (runs `tygo generate`). Do NOT hand-edit
 * the generated files — edit the kernel's manifest/v3/types.go and regenerate.
 *
 * The legacy v2 types remain available as `Legacy*` aliases (and under their
 * original names via ./generated/manifest) so consumers that still reference
 * the v2 shape keep type-checking during the migration window. The kernel
 * dual-reads v2 for backwards compatibility.
 */
// Side-effect imports so declaration-merging blocks (if any) resolve.
import "./generated/manifest-v3";
import "./generated/manifest";
// ---------------------------------------------------------------------------
// Module Contract v3 — canonical surface.
// ---------------------------------------------------------------------------
export { APIVersion as METACORE_API_VERSION } from "./generated/manifest-v3";
export { APIVersion as METACORE_API_VERSION_V2 } from "./generated/manifest";
