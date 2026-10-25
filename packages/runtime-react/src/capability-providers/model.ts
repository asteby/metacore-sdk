// Pure model of GET /api/capabilities + GET /api/markets, kept free of
// runtime imports so it is unit-testable without the app's api client.
//
// The screen groups the technical capability contracts
// (commerce.payments.session/confirm/status/refund…) by business DOMAIN
// ("Pagos") and lets the admin choose ONE provider per domain and market; the
// choice is applied to every contract of the bundle the provider offers. The
// resolution below mirrors the kernel's capability.Select so what the screen
// says is what the checkout will do.

export type I18nText = Record<string, string>

export type CapabilityProvider = {
  addon_key: string
  /** Addon i18n key of the binding label (e.g. mercadopago.capability.session.label). */
  label?: string
  installed: boolean
  /** Org-level default (used where a market has no selection of its own). */
  default: boolean
  /** Market codes this provider is explicitly selected for. */
  markets?: string[]
  /** ISO countries the provider declared it serves; empty = any. */
  countries?: string[]
}

export type CapabilityView = {
  key: string
  providers: CapabilityProvider[]
  domain?: string
  title?: I18nText
  description?: I18nText
  /** A buyer-facing flow needs a provider for it in every market. */
  checkout?: boolean
  /** Every eligible provider answers (shipping rates…): nothing to choose. */
  fanout?: boolean
  /** Follow-ups go to the provider that created the operation. */
  pinned?: boolean
}

export type CapabilityDomain = {
  key: string
  title?: I18nText
  description?: I18nText
  icon?: string
  order?: number
}

export type ConnectionState = 'connected' | 'missing_credentials' | 'not_required'

export type ProviderInfo = {
  addon_key: string
  name?: I18nText
  icon?: string
  connection?: {
    state: ConnectionState
    environment?: 'sandbox' | 'production' | ''
    connector?: string
    testable?: boolean
  }
}

export type Market = {
  code: string
  name?: string
  countries?: string[]
  currency?: string
  is_default?: boolean
  active?: boolean
}

export type CapabilitiesPayload = {
  data: CapabilityView[]
  domains?: CapabilityDomain[]
  providers?: Record<string, ProviderInfo>
}

/** Pick a locale's text: exact, base language, es, en, any. */
export function pickText(text: I18nText | undefined, locale?: string): string {
  if (!text) return ''
  const l = (locale ?? '').trim()
  if (l && text[l]) return text[l]
  const baseLang = l.split(/[-_]/)[0]?.toLowerCase()
  if (baseLang && text[baseLang]) return text[baseLang]
  for (const k of ['es', 'en', 'default']) if (text[k]) return text[k]
  return Object.values(text).find(Boolean) ?? ''
}

/** "commerce.payments.session" → "commerce.payments" (fallback when the API has no domain). */
export function domainOf(key: string): string {
  const parts = key.split('.')
  return parts.length > 2 ? parts.slice(0, 2).join('.') : key
}

/** Readable title from a key segment, never the dotted id ("loyalty" → "Loyalty"). */
export function humanizeSegment(key: string): string {
  const seg = key.split('.').pop() ?? key
  return seg.replace(/[_-]+/g, ' ').replace(/^\w/, (m) => m.toUpperCase())
}

export function servesMarket(p: CapabilityProvider, m: Market | null): boolean {
  if (!m) return true
  const pc = p.countries ?? []
  const mc = m.countries ?? []
  if (pc.length === 0 || mc.length === 0) return true
  return pc.some((c) => mc.some((x) => x.toUpperCase() === c.toUpperCase()))
}

export type ResolutionReason =
  | 'selected' // explicitly chosen for the market
  | 'default' // org default
  | 'only' // the only eligible provider
  | 'fanout' // every eligible provider answers
  | 'ambiguous' // several eligible, none chosen: dispatch fails
  | 'none' // nobody installed serves this market

export type Resolution = {
  key: string
  addon?: string
  /** Fan-out: every provider that will answer. */
  addons?: string[]
  reason: ResolutionReason
  eligible: string[]
}

/**
 * Which provider answers capability `c` in market `m` (null = organization
 * level). Mirrors kernel capability.Select: market selection, then org
 * default among eligible, then the only eligible provider.
 */
export function resolveCapability(c: CapabilityView, m: Market | null): Resolution {
  const installed = c.providers.filter((p) => p.installed)
  const selected = m ? installed.filter((p) => (p.markets ?? []).includes(m.code)) : []
  const eligible = installed.filter((p) => servesMarket(p, m))
  const eligibleKeys = eligible.map((p) => p.addon_key)
  if (c.fanout) {
    const answering = selected.length ? selected : eligible
    if (answering.length === 0) return { key: c.key, reason: 'none', eligible: eligibleKeys }
    return { key: c.key, reason: 'fanout', addons: answering.map((p) => p.addon_key), eligible: eligibleKeys }
  }
  if (selected.length === 1) return { key: c.key, addon: selected[0].addon_key, reason: 'selected', eligible: eligibleKeys }
  if (selected.length > 1) return { key: c.key, reason: 'ambiguous', eligible: eligibleKeys }
  const defaults = eligible.filter((p) => p.default)
  if (defaults.length === 1) return { key: c.key, addon: defaults[0].addon_key, reason: 'default', eligible: eligibleKeys }
  if (defaults.length > 1) return { key: c.key, reason: 'ambiguous', eligible: eligibleKeys }
  if (eligible.length === 1) return { key: c.key, addon: eligible[0].addon_key, reason: 'only', eligible: eligibleKeys }
  if (eligible.length === 0) return { key: c.key, reason: 'none', eligible: eligibleKeys }
  return { key: c.key, reason: 'ambiguous', eligible: eligibleKeys }
}

export type CellStatus =
  | 'ok' // one provider for the whole bundle
  | 'mixed' // several providers split the bundle (chosen in "Avanzado")
  | 'needs_choice' // several candidates and nobody chosen
  | 'no_provider' // nobody installed serves this market
  | 'fanout' // every compatible provider answers

export type DomainCell = {
  market: Market | null
  status: CellStatus
  /** The provider of the bundle when status is ok. */
  provider?: string
  /** Providers in use (mixed / fanout). */
  providers: string[]
  resolutions: Resolution[]
  /** Providers that can be chosen for the bundle in this market. */
  candidates: string[]
  /** Installed providers of the domain that do NOT serve this market. */
  blocked: string[]
  /** One-click suggestion when exactly one candidate is ready. */
  recommended?: string
  /** Checkout contracts left without a provider in this market. */
  checkoutGaps: string[]
}

export type DomainGroup = {
  key: string
  domain: CapabilityDomain
  capabilities: CapabilityView[]
  /** Installed providers of any capability of the domain, sorted. */
  providers: string[]
  /** Capability keys each provider offers in this domain. */
  provides: Record<string, string[]>
  cells: DomainCell[]
  fanoutOnly: boolean
}

const isReady = (info?: ProviderInfo) => !info?.connection || info.connection.state !== 'missing_credentials'

export function recommendProvider(
  candidates: string[],
  providers: Record<string, ProviderInfo> | undefined,
): string | undefined {
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]
  const connected = candidates.filter((a) => providers?.[a]?.connection?.state === 'connected')
  if (connected.length === 1) return connected[0]
  const ready = candidates.filter((a) => isReady(providers?.[a]))
  if (ready.length === 1) return ready[0]
  return undefined
}

function buildCell(
  caps: CapabilityView[],
  m: Market | null,
  provides: Record<string, string[]>,
  providers: Record<string, ProviderInfo> | undefined,
): DomainCell {
  const resolutions = caps.map((c) => resolveCapability(c, m))
  const chosen = caps.filter((c) => !c.fanout)
  const single = resolutions.filter((_, i) => !caps[i].fanout)
  const inUse = [...new Set(single.map((r) => r.addon).filter((a): a is string => !!a))]
  const checkoutGaps = caps
    .filter((c, i) => c.checkout && (resolutions[i].reason === 'none' || resolutions[i].reason === 'ambiguous'))
    .map((c) => c.key)
  // Candidates: providers that serve this market for at least one
  // choosable contract of the domain.
  const candidates = Object.keys(provides)
    .filter((a) => chosen.some((c) => c.providers.some((p) => p.addon_key === a && p.installed && servesMarket(p, m))))
    .sort()
  const blocked = Object.keys(provides)
    .filter((a) => !candidates.includes(a) && chosen.length > 0)
    .sort()
  const base = { market: m, resolutions, candidates, blocked, checkoutGaps }
  if (chosen.length === 0) {
    const answering = [...new Set(resolutions.flatMap((r) => r.addons ?? []))].sort()
    return { ...base, status: answering.length ? 'fanout' : 'no_provider', providers: answering }
  }
  if (single.some((r) => r.reason === 'ambiguous')) {
    return { ...base, status: 'needs_choice', providers: inUse, recommended: recommendProvider(candidates, providers) }
  }
  if (inUse.length > 1) return { ...base, status: 'mixed', providers: inUse }
  if (inUse.length === 0) return { ...base, status: 'no_provider', providers: [] }
  return { ...base, status: 'ok', provider: inUse[0], providers: inUse }
}

/**
 * Group the usable capabilities (at least one installed provider) by domain
 * and resolve each domain per market. With no active market the single
 * column is the organization level (market null).
 */
export function groupByDomain(
  payload: CapabilitiesPayload,
  markets: Market[],
): DomainGroup[] {
  const usable = payload.data.filter((c) => c.providers.some((p) => p.installed))
  const domainMeta = new Map((payload.domains ?? []).map((d) => [d.key, d]))
  const byDomain = new Map<string, CapabilityView[]>()
  for (const c of usable) {
    const d = c.domain || domainOf(c.key)
    byDomain.set(d, [...(byDomain.get(d) ?? []), c])
  }
  const columns: (Market | null)[] = activeMarkets(markets).length ? activeMarkets(markets) : [null]
  const groups: DomainGroup[] = []
  for (const [key, caps] of byDomain) {
    const provides: Record<string, string[]> = {}
    for (const c of caps)
      for (const p of c.providers)
        if (p.installed) provides[p.addon_key] = [...(provides[p.addon_key] ?? []), c.key]
    groups.push({
      key,
      domain: domainMeta.get(key) ?? { key, order: 1000 },
      capabilities: caps,
      providers: Object.keys(provides).sort(),
      provides,
      cells: columns.map((m) => buildCell(caps, m, provides, payload.providers)),
      fanoutOnly: caps.every((c) => c.fanout),
    })
  }
  return groups.sort(
    (a, b) => (a.domain.order ?? 1000) - (b.domain.order ?? 1000) || a.key.localeCompare(b.key),
  )
}

/** Active markets, default first, then by name. */
export function activeMarkets(markets: Market[]): Market[] {
  return markets
    .filter((m) => m.active !== false)
    .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || (a.name ?? a.code).localeCompare(b.name ?? b.code))
}

/**
 * The selections to send when `addon` becomes the provider of the whole
 * domain in market m: every choosable contract of the domain the addon
 * provides and serves there. Contracts it does not provide are left as they
 * are.
 */
export function bundleSelections(group: DomainGroup, addon: string, m: Market | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of group.capabilities) {
    if (c.fanout) continue
    const p = c.providers.find((x) => x.addon_key === addon && x.installed)
    if (p && servesMarket(p, m)) out[c.key] = addon
  }
  return out
}

/**
 * What is stored today for these keys in market m ("" = nothing chosen), so
 * "Deshacer" can send it back as is.
 */
export function storedSelections(group: DomainGroup, keys: string[], m: Market | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const c = group.capabilities.find((x) => x.key === k)
    const hit = c?.providers.find((p) => p.installed && (m ? (p.markets ?? []).includes(m.code) : p.default))
    out[k] = hit?.addon_key ?? ''
  }
  return out
}

export type ChoiceBlock = { addon: string; reason: 'market' | 'not_provided'; countries?: string[] }

/** Why `addon` cannot be the domain provider in market m (null = it can). */
export function choiceBlock(group: DomainGroup, addon: string, m: Market | null): ChoiceBlock | null {
  const offers = group.capabilities.filter((c) => !c.fanout && c.providers.some((p) => p.addon_key === addon && p.installed))
  if (offers.length === 0) return { addon, reason: 'not_provided' }
  const serving = offers.filter((c) => servesMarket(c.providers.find((p) => p.addon_key === addon)!, m))
  if (serving.length === 0) {
    const countries = offers[0].providers.find((p) => p.addon_key === addon)?.countries
    return { addon, reason: 'market', countries }
  }
  return null
}

/** Markets whose checkout lacks a provider for a contract it needs. */
export function checkoutBlockers(groups: DomainGroup[]): { group: DomainGroup; cell: DomainCell }[] {
  const out: { group: DomainGroup; cell: DomainCell }[] = []
  for (const g of groups) for (const cell of g.cells) if (cell.checkoutGaps.length) out.push({ group: g, cell })
  return out
}

export type ChangeImpact = {
  /** Contracts the change writes (the bundle the provider offers and serves). */
  keys: string[]
  /** Providers answering those contracts today (effective, not only stored). */
  from: string[]
  /** Every key already resolves to the provider. */
  sameProvider: boolean
  /** Every key already STORES this provider as an explicit selection. */
  alreadyStored: boolean
  /** Something would change on save (a different provider or an explicit pin). */
  saveable: boolean
}

/** Impact preview of making `addon` the provider of the domain in market m. */
export function changeImpact(group: DomainGroup, addon: string, m: Market | null): ChangeImpact {
  const keys = Object.keys(bundleSelections(group, addon, m))
  const idx = group.cells.findIndex((c) => (c.market?.code ?? '') === (m?.code ?? ''))
  const res = idx >= 0 ? group.cells[idx].resolutions.filter((r) => keys.includes(r.key)) : []
  const from = [...new Set(res.map((r) => r.addon).filter((a): a is string => !!a))]
  const sameProvider = res.length > 0 && res.every((r) => r.addon === addon)
  const stored = storedSelections(group, keys, m)
  const alreadyStored = keys.length > 0 && keys.every((k) => stored[k] === addon)
  return { keys, from, sameProvider, alreadyStored, saveable: keys.length > 0 && !alreadyStored }
}

// ─── Legacy flat view (kept for callers that list capabilities one by one) ──

export type UsableCapability = CapabilityView & {
  installed: CapabilityProvider[]
  /** The provider the host routes to today, if any. */
  current?: CapabilityProvider
  /** Several installed providers and none marked default: dispatch fails. */
  ambiguous: boolean
}

// Only capabilities the org can actually use (at least one provider
// installed), mirroring the host's choice: the marked default, else the only
// installed provider; several without a default is ambiguous.
export function usableCapabilities(data: CapabilityView[]): UsableCapability[] {
  return data
    .map((c) => {
      const installed = c.providers.filter((p) => p.installed)
      const current =
        installed.find((p) => p.default) ??
        (installed.length === 1 ? installed[0] : undefined)
      return {
        ...c,
        installed,
        current,
        ambiguous: installed.length > 1 && !current,
      }
    })
    .filter((c) => c.installed.length > 0)
}

/**
 * Is there anything to decide on «Proveedores por capacidad»? Only when the
 * organization sells in more than one market, or some function can be served
 * by more than one installed provider. With a single market and one provider
 * per function the screen would only repeat what is already installed
 * («MX» under «MX»), so the entry stays out of the way until it matters.
 */
export function needsProviderChoice(
  capabilities: readonly CapabilityView[] | undefined,
  markets: readonly Market[] | undefined,
): boolean {
  const activeMarkets = (markets ?? []).filter((m) => m.active !== false)
  if (activeMarkets.length > 1) return true
  return (capabilities ?? []).some(
    (c) => !c.fanout && c.providers.filter((p) => p.installed).length > 1,
  )
}

/**
 * Installed addons that compete with another installed addon for the same
 * function (a non-fan-out capability with 2+ installed providers: Mercado
 * Pago and Pagos manuales both charge). Their card in «Addons instalados»
 * links to «Proveedores por capacidad», where the choice is made.
 */
export function competingProviderAddons(
  capabilities: readonly CapabilityView[] | undefined,
): Set<string> {
  const out = new Set<string>()
  for (const c of capabilities ?? []) {
    if (c.fanout) continue
    const installed = c.providers.filter((p) => p.installed)
    if (installed.length > 1) installed.forEach((p) => out.add(p.addon_key))
  }
  return out
}

// ─── Status of a provider for a market (feeds ProviderSortableList) ─────────

export type ProviderStatus = 'ready' | 'missing_credentials' | 'sandbox' | 'unavailable'

/**
 * The badge a provider deserves in market `m`: `unavailable` when it does not
 * serve the market ("No atiende"), `missing_credentials` when it still needs
 * to be connected, `sandbox` when it runs against a test environment, else
 * `ready`. Providers that need no connection are ready.
 */
export function providerStatus(
  provider: CapabilityProvider,
  info: ProviderInfo | undefined,
  m: Market | null,
): ProviderStatus {
  if (!servesMarket(provider, m)) return 'unavailable'
  if (info?.connection?.state === 'missing_credentials') return 'missing_credentials'
  if (info?.connection?.state === 'connected' && info.connection.environment === 'sandbox') return 'sandbox'
  return 'ready'
}
