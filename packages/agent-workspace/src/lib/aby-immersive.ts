/**
 * Immersive (full-screen) addon routes live OUTSIDE the authenticated shell
 * (see routes/addons/$key/$.tsx), so Aby's floating chat — and the team-call
 * provider it needs — are mounted by the route itself instead of the shell.
 *
 * Most immersive addons are operator workstations (POS terminal, purchases,
 * BI) where the copilot belongs. A few are customer-facing self-service or
 * passive displays, where a STAFF copilot and incoming-call banners must not
 * appear. The manifest carries no signal for this yet (`frontend.layout` is
 * "immersive" for all of them and `category` does not separate kiosk from
 * POS), so the host keeps the exclusion list — by addon key, the only stable
 * identifier available. Move it to the manifest once the schema has a field.
 */
export const COPILOT_HIDDEN_ON_IMMERSIVE: ReadonlySet<string> = new Set([
  'kiosk', // customer self-service
  'kds', // kitchen display: passive screen, no operator session
])

export function immersiveCopilotEnabled(addonKey: string | undefined): boolean {
  if (!addonKey) return false
  return !COPILOT_HIDDEN_ON_IMMERSIVE.has(addonKey)
}
