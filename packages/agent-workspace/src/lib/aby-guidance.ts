import type { DriveStep, Driver } from 'driver.js'
import { toast } from 'sonner'
import { storageKey } from '../host'
import { abyCapabilities } from './aby-capability-registry'

export type AbyGuideStep = {
  id: string
  title: string
  description: string
  /** Stable semantic target owned by the screen/addon. Never use generated CSS classes. */
  target?: string
  /** Route where this step lives. Supports host and immersive federated routes. */
  route?: string
  /** ui (default) | concept — concept steps spotlight body for teaching copy. */
  kind?: 'ui' | 'concept'
  /** Advance when the user actually performs the step (DOM or ops:* event). */
  advanceOn?: { event: string; target?: string }
  /**
   * When true, a missing target skips to the next step instead of toasting.
   * Used for optional create-form fields that may be readonly/hidden/visible_when
   * off-screen (e.g. migration-only `external_id`).
   */
  optional?: boolean
}

export type AbyGuide = {
  id: string
  title: string
  description: string
  owner: string
  intents: string[]
  /** Other guide ids that should complete before this one starts. */
  prerequisites?: string[]
  steps: AbyGuideStep[]
}

type GuidanceAPI = {
  registerGuide: (guide: AbyGuide) => () => void
  registerTarget: (
    name: string,
    target: string | Element | (() => Element | null)
  ) => () => void
  /**
   * Surfaces that can hide targets (collapsed sidebar groups, closed sheets)
   * register a revealer for a target-name prefix. It runs when a step's target
   * is not in the DOM and should make it appear (expand, open…).
   */
  registerRevealer: (prefix: string, reveal: TargetRevealer) => () => void
  listGuides: () => AbyGuide[]
  listTargets: () => string[]
  validateGuides: () => Array<{ guideId: string; stepId: string; status: 'ready' | 'deferred' | 'missing' }>
  findGuide: (text: string) => AbyGuide | undefined
  startGuide: (id: string) => Promise<void>
  stopGuide: () => void
}

export type TargetRevealer = (name: string) => boolean | Promise<boolean>

const guides = new Map<string, AbyGuide>()
const targets = new Map<string, string | Element | (() => Element | null)>()
const revealers = new Map<string, TargetRevealer>()
const PENDING_KEY = () => storageKey('aby-guidance:pending')
const COMPLETED_KEY = () => storageKey('aby-guidance:completed')
const AFTER_KEY = () => storageKey('aby-guidance:after')
let activeDriver: Driver | null = null

// driver.js (and its CSS) load when a guide first shows a step, not with the
// shell: the guidance contract is installed at boot for every page, a tour
// runs on a few of them.
let driverModule: Promise<typeof import('driver.js')> | null = null
function loadDriver(): Promise<typeof import('driver.js')> {
  if (!driverModule) {
    driverModule = Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]).then(
      ([mod]) => mod,
      (err) => {
        driverModule = null
        throw err
      }
    )
  }
  return driverModule
}
let activeStepCleanup: (() => void) | null = null

function readCompleted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(COMPLETED_KEY())
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function markGuideCompleted(guideId: string): void {
  const next = readCompleted()
  next.add(guideId)
  sessionStorage.setItem(COMPLETED_KEY(), JSON.stringify([...next]))
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveTarget(name?: string): Element | null {
  if (!name) return document.body
  const registered = targets.get(name)
  if (typeof registered === 'function') return registered()
  if (registered instanceof Element) return registered
  if (typeof registered === 'string') return document.querySelector(registered)
  const annotated = document.querySelector(`[data-aby-target="${CSS.escape(name)}"]`)
  if (annotated) return annotated

  // Dynamic modal fields are metadata-driven and may not exist when the host
  // registers the surface. Resolve their stable field key lazily at guide time.
  // Prefer data-aby-field (stamped by the host / SDK); never require the legacy
  // id="dynamic-record-form" — nested create uses React useId().
  const fieldMatch = name.match(/^model\.([^.]+)\.(create|edit|view)\.field\.(.+)$/)
  if (fieldMatch) {
    const [, model, mode, key] = fieldMatch
    const scoped = document.querySelector(
      `[data-aby-record-form][data-aby-model="${CSS.escape(model)}"][data-aby-mode="${CSS.escape(mode)}"] [data-aby-field="${CSS.escape(key)}"]`,
    )
    if (scoped) return scoped
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1]
    return (
      dialog?.querySelector(`[data-aby-field="${CSS.escape(key)}"]`) ??
      dialog?.querySelector(
        `[name="${CSS.escape(key)}"], #${CSS.escape(key)}, [aria-label="${CSS.escape(key)}"]`,
      ) ??
      null
    )
  }
  return null
}

async function waitForTarget(
  name?: string,
  timeoutMs = 12_000
): Promise<Element | null> {
  const immediate = resolveTarget(name)
  if (immediate) return immediate
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = resolveTarget(name)
      if (!element) return
      observer.disconnect()
      window.clearTimeout(timer)
      resolve(element)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
    const timer = window.setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeoutMs)
  })
}

/** Create-form field targets (`model.x.create.field.y`) — optional ones may be absent. */
export function isCreateFieldTarget(target?: string): boolean {
  return Boolean(target && /^model\.[^.]+\.create\.field\./.test(target))
}

/** Optional field missing from the create form → skip instead of trapping the tour. */
export function shouldSkipMissingStep(step: AbyGuideStep): boolean {
  return Boolean(step.optional && isCreateFieldTarget(step.target))
}

/**
 * Guide routes are declared in addon manifests as ROUTER paths
 * ("/addons/pos/terminal") — the same shape as `addon://` nav targets — and
 * are host-agnostic by design: a manifest cannot know which basepath the
 * shell mounts under. The SPA lives under Vite's `base` ("/app/", see
 * vite.config.ts + main.tsx `basepath`), so a raw `location.assign(route)`
 * lands outside the app and nginx answers 404. Resolve every step route
 * against that base before comparing or navigating. Exported for tests.
 */
export function resolveGuideRoute(route: string, base: string = import.meta.env.BASE_URL): string {
  const trimmedBase = base.replace(/\/+$/, '')
  if (!trimmedBase) return route
  if (route === trimmedBase || route.startsWith(trimmedBase + '/')) return route
  return trimmedBase + (route.startsWith('/') ? route : '/' + route)
}

/**
 * In-app navigator injected by the host (TanStack Router). Without it, guide
 * route changes fall back to location.assign — a full document reload that
 * kills the SPA and feels like "Siguiente recarga la web".
 */
export type GuideNavigate = (routerPath: string) => void
let guideNavigate: GuideNavigate | null = null

export function setGuideNavigate(navigate: GuideNavigate | null): void {
  guideNavigate = navigate
}

/** Strip the SPA basepath so TanStack `navigate({ to })` does not double-prefix. */
export function guideRouteToRouterPath(
  route: string,
  base: string = import.meta.env.BASE_URL,
): string {
  const resolved = resolveGuideRoute(route, base)
  const trimmedBase = base.replace(/\/+$/, '')
  if (trimmedBase && resolved.startsWith(trimmedBase)) {
    return resolved.slice(trimmedBase.length) || '/'
  }
  return resolved
}

function navigateToGuideRoute(route: string): void {
  const resolved = resolveGuideRoute(route)
  if (guideNavigate) {
    guideNavigate(guideRouteToRouterPath(route))
    return
  }
  window.location.assign(resolved)
}

function sameRoute(route?: string): boolean {
  return !route || window.location.pathname === resolveGuideRoute(route)
}

/** Runs every revealer whose prefix owns `name`. True when any of them acted. */
async function revealTarget(name?: string): Promise<boolean> {
  if (!name) return false
  let acted = false
  for (const [prefix, reveal] of revealers) {
    if (!name.startsWith(prefix)) continue
    try {
      acted = (await reveal(name)) || acted
    } catch {
      // A broken revealer must not break the tour — waitForTarget still runs.
    }
  }
  return acted
}

/** Brings the target into view inside nested scroll containers (sidebar, modals). */
function scrollTargetIntoView(element: Element): void {
  const rect = element.getBoundingClientRect()
  const inView =
    rect.top >= 0 &&
    rect.bottom <= window.innerHeight &&
    // Nested scrollers (sidebar content) clip without changing the window rect.
    !isClippedByScrollParent(element, rect)
  if (!inView) element.scrollIntoView({ block: 'center', inline: 'nearest' })
}

function isClippedByScrollParent(element: Element, rect: DOMRect): boolean {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue
    const box = parent.getBoundingClientRect()
    if (rect.top < box.top || rect.bottom > box.bottom) return true
  }
  return false
}

export type PendingGuide = { guideId: string; stepIndex: number }

/** Delay before resuming so the destination surface (often a federated addon) finishes mounting. */
const RESUME_DELAY_MS = 250
let resumeInFlight = false

function readPending(): PendingGuide | null {
  const raw = sessionStorage.getItem(PENDING_KEY())
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingGuide>
    if (typeof parsed.guideId !== 'string' || typeof parsed.stepIndex !== 'number') {
      throw new Error('malformed pending guide')
    }
    return { guideId: parsed.guideId, stepIndex: parsed.stepIndex }
  } catch {
    sessionStorage.removeItem(PENDING_KEY())
    return null
  }
}

/**
 * Whether a guide that has JUST been registered should pick up the pending
 * resume. Guides declared in addon manifests register late — from a React
 * effect once the installed manifests load — so `bootstrapAbyGuidance()`
 * (which runs synchronously at app boot) never finds them and the resume
 * after a route navigation silently never happens. Pure so it is unit-tested.
 *
 * A late registration only resumes when the user is ALREADY on the step's
 * route: it must never yank someone to another screen. Navigating to the
 * step is the guide's own job (runStep → location.assign), and after that
 * navigation this is exactly the case that fires.
 */
export function shouldResumeOnRegister(
  pending: PendingGuide | null,
  guide: AbyGuide,
  pathname: string,
  base?: string,
): boolean {
  if (!pending || pending.guideId !== guide.id) return false
  const step = guide.steps[pending.stepIndex]
  if (!step) return false
  return !step.route || pathname === resolveGuideRoute(step.route, base)
}

/**
 * Idempotent: React re-renders re-register guides (effect cleanup + re-run),
 * so the same pending step could be picked up several times. A step is never
 * driven twice — skip while a tour is active or a resume is already in flight.
 */
function scheduleResume(guide: AbyGuide, stepIndex: number): void {
  if (activeDriver || resumeInFlight) return
  resumeInFlight = true
  window.setTimeout(() => {
    // runStep already reports failures via the ops:aby-guide-error event.
    void runStep(guide, stepIndex)
      .catch(() => {})
      .finally(() => {
        resumeInFlight = false
      })
  }, RESUME_DELAY_MS)
}

export type GuideStepChrome = { nextLabel: string; progressText: string; canGoBack: boolean }

/**
 * Tour-level popover chrome for one step. Each step is driven by its OWN
 * single-step driver.js instance (a step may live on another route, so the
 * tour has to survive a full navigation) — which means driver.js sees every
 * step as both the first and the last: it renders the DONE button (so
 * `doneBtnText` wins and `nextBtnText` is never used), interpolates its
 * progress as "1 de 1", and disables "Atrás" via CSS. The real position in
 * the guide is computed here instead. Pure so it is unit-tested.
 */
export function guideStepChrome(stepIndex: number, total: number): GuideStepChrome {
  const isLast = stepIndex >= total - 1
  return {
    nextLabel: isLast ? 'Terminar' : 'Siguiente',
    progressText: `${stepIndex + 1} de ${total}`,
    canGoBack: stepIndex > 0,
  }
}

/**
 * Whether the highlighted target is inert right now (a disabled button, an
 * aria-disabled control, a form control under a disabled fieldset), so the
 * user cannot actually perform the step yet — e.g. "Crear venta" with an
 * empty cart. Pure DOM read, unit-tested.
 */
export function isTargetDisabled(element: Element): boolean {
  const control =
    element.closest('button, input, select, textarea, a, [role="button"], [aria-disabled]') ?? element
  return (
    (control as HTMLButtonElement).disabled === true ||
    control.getAttribute('aria-disabled') === 'true' ||
    control.matches(':disabled')
  )
}

export const DISABLED_TARGET_HINT =
  'Este botón está deshabilitado por ahora: completa los pasos anteriores para continuar.'

/** Popover copy for a step — says WHY the user is stuck when its target is disabled, instead of going silent. */
export function describeStep(step: AbyGuideStep, element: Element): string {
  return isTargetDisabled(element) ? `${step.description} ${DISABLED_TARGET_HINT}` : step.description
}

/** Toast copy when a step's target is not on screen (e.g. it lives inside a modal the user has not opened yet). */
export function missingTargetMessage(step: AbyGuideStep): string {
  return `No encuentro "${step.title}" en pantalla. Completa el paso actual y vuelve a intentarlo.`
}

function savePending(guideId: string, stepIndex: number): void {
  sessionStorage.setItem(PENDING_KEY(), JSON.stringify({ guideId, stepIndex }))
}

/**
 * "Siguiente" on an action step (advanceOn click) performs the action the step
 * is pointing at — the next step usually lives inside what it opens (a create
 * form), so skipping the click left the tour with a target that never appears.
 * Pure DOM decision, exported for tests.
 */
export function shouldPerformOnNext(step: AbyGuideStep, element: Element): boolean {
  return (
    step.advanceOn?.event === 'click' &&
    !step.advanceOn.target &&
    element.isConnected &&
    element !== document.body &&
    !isTargetDisabled(element)
  )
}

function advanceFromStep(guide: AbyGuide, stepIndex: number, element: Element): void {
  const step = guide.steps[stepIndex]
  // Drop the advance listener first so the synthetic click does not advance twice.
  activeStepCleanup?.()
  activeStepCleanup = null
  const nextIndex = stepIndex + 1
  const nextStep = guide.steps[nextIndex]

  if (step && shouldPerformOnNext(step, element)) {
    const leavesRoute = Boolean(nextStep?.route && !sameRoute(nextStep.route))
    const isAnchor =
      element instanceof HTMLAnchorElement || Boolean(element.closest('a[href]'))
    ;(element as HTMLElement).click()
    // Clicking a sidebar Link starts SPA navigation; racing runStep →
    // location.assign on the still-old pathname hard-reloads the document.
    // Persist the next step and let resume (or soft navigate) pick it up.
    if (leavesRoute && nextStep?.route) {
      savePending(guide.id, nextIndex)
      activeDriver?.destroy()
      activeDriver = null
      if (!isAnchor) navigateToGuideRoute(nextStep.route)
      return
    }
  }
  void runStep(guide, nextIndex)
}

async function runStep(guide: AbyGuide, stepIndex: number): Promise<void> {
  activeStepCleanup?.()
  activeStepCleanup = null
  const step = guide.steps[stepIndex]
  if (!step) {
    sessionStorage.removeItem(PENDING_KEY())
    activeDriver?.destroy()
    activeDriver = null
    markGuideCompleted(guide.id)
    window.dispatchEvent(
      new CustomEvent('ops:aby-guide-completed', {
        detail: { guideId: guide.id },
      })
    )
    const after = sessionStorage.getItem(AFTER_KEY())
    if (after && after !== guide.id) {
      sessionStorage.removeItem(AFTER_KEY())
      void abyGuidance.startGuide(after).catch(() => {})
    }
    return
  }
  savePending(guide.id, stepIndex)
  if (!sameRoute(step.route)) {
    navigateToGuideRoute(step.route!)
    return
  }

  // Fetch driver.js while the target is being waited for.
  void loadDriver().catch(() => {})
  // Targets inside collapsed surfaces (a closed sidebar group) are not in the
  // DOM at all: ask the owning surface to reveal them before waiting.
  if (!resolveTarget(step.target)) await revealTarget(step.target)
  // Optional create fields (readonly / hidden / visible_when) often never mount —
  // fail fast instead of a 12s hang before skipping.
  const waitMs = shouldSkipMissingStep(step) ? 1_200 : 12_000
  const element = await waitForTarget(step.target, waitMs)
  if (element) scrollTargetIntoView(element)
  if (!element) {
    if (shouldSkipMissingStep(step)) {
      return runStep(guide, stepIndex + 1)
    }
    sessionStorage.removeItem(PENDING_KEY())
    window.dispatchEvent(
      new CustomEvent('ops:aby-guide-error', {
        detail: {
          guideId: guide.id,
          stepId: step.id,
          reason: 'target_not_found',
        },
      })
    )
    // Never fail silently: the previous popover stays on screen so the user can
    // finish the current step and press "Siguiente" again. A fixed id replaces
    // the toast on retries instead of stacking one per attempt.
    toast.error(missingTargetMessage(step), { id: 'aby-guide-target' })
    throw new Error(`Guide target not found: ${step.target ?? 'body'}`)
  }

  const { driver } = await loadDriver()
  const driveStep: DriveStep = {
    element,
    popover: {
      title: step.title,
      description: describeStep(step, element),
      side: 'bottom',
      align: 'start',
      onNextClick: () => advanceFromStep(guide, stepIndex, element),
      onPrevClick: () => void runStep(guide, Math.max(0, stepIndex - 1)),
    },
  }
  const chrome = guideStepChrome(stepIndex, guide.steps.length)
  activeDriver?.destroy()
  activeDriver = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.58,
    popoverClass: 'aby-guide-popover',
    // Single-step driver → driver.js always renders the DONE button, so both
    // texts carry the tour-level label (see guideStepChrome).
    nextBtnText: chrome.nextLabel,
    doneBtnText: chrome.nextLabel,
    prevBtnText: 'Atrás',
    // A literal (no {{current}}/{{total}}) passes through driver.js untouched.
    progressText: chrome.progressText,
    steps: [driveStep],
    onPopoverRender: (popover) => {
      // driver.js disables "Atrás" on ITS first step with a CSS-only class
      // (pointer-events: none); the click still routes to our onPrevClick.
      if (chrome.canGoBack) popover.previousButton.classList.remove('driver-popover-btn-disabled')
    },
    onCloseClick: () => abyGuidance.stopGuide(),
    onDestroyed: () => {
      activeDriver = null
    },
  })
  activeDriver.drive()

  if (step.advanceOn?.event) {
    let advanced = false
    const eventTarget: EventTarget = step.advanceOn.event.startsWith('ops:')
      ? window
      : (resolveTarget(step.advanceOn.target ?? step.target) ?? element)
    const onAdvance = () => {
      if (advanced) return
      advanced = true
      void runStep(guide, stepIndex + 1)
    }
    eventTarget.addEventListener(step.advanceOn.event, onAdvance, { once: true })
    activeStepCleanup = () => eventTarget.removeEventListener(step.advanceOn!.event, onAdvance)
  }
}

export const abyGuidance: GuidanceAPI = {
  registerGuide(guide) {
    if (!guide.id || !guide.steps.length)
      throw new Error('A guide needs an id and at least one step')
    guides.set(guide.id, guide)
    // Late registration (manifest-driven guides): pick up a resume that
    // bootstrapAbyGuidance() could not, because this guide did not exist yet.
    const pending = readPending()
    if (pending && shouldResumeOnRegister(pending, guide, window.location.pathname)) {
      scheduleResume(guide, pending.stepIndex)
    }
    const unregisterCapability = abyCapabilities.register({
      id: `${guide.owner}.guide.${guide.id.replace(/^[^.]+\./, '')}`,
      owner: guide.owner,
      title: guide.title,
      description: guide.description,
      kind: 'guide',
      risk: 'none',
      guideId: guide.id,
      route: guide.steps[0]?.route,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => abyGuidance.startGuide(guide.id),
      tags: ['onboarding', 'help'],
    })
    return () => {
      if (guides.get(guide.id) === guide) {
        guides.delete(guide.id)
        unregisterCapability()
      }
    }
  },
  registerTarget(name, target) {
    targets.set(name, target)
    return () => {
      if (targets.get(name) === target) targets.delete(name)
    }
  },
  registerRevealer(prefix, reveal) {
    revealers.set(prefix, reveal)
    return () => {
      if (revealers.get(prefix) === reveal) revealers.delete(prefix)
    }
  },
  listGuides: () => [...guides.values()],
  listTargets: () =>
    [
      ...new Set([
        ...targets.keys(),
        ...[...document.querySelectorAll('[data-aby-target]')]
          .map((element) => element.getAttribute('data-aby-target'))
          .filter((name): name is string => Boolean(name)),
      ]),
    ].sort(),
  validateGuides: () =>
    [...guides.values()].flatMap((guide) =>
      guide.steps.map((step) => ({
        guideId: guide.id,
        stepId: step.id,
        status: !sameRoute(step.route)
          ? ('deferred' as const)
          : resolveTarget(step.target)
            ? ('ready' as const)
            : ('missing' as const),
      })),
    ),
  findGuide(text) {
    const haystack = normalize(text)
    return [...guides.values()]
      .map((guide) => ({
        guide,
        score: Math.max(
          0,
          ...guide.intents.map((intent) =>
            haystack.includes(normalize(intent)) ? normalize(intent).length : 0
          )
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .find((row) => row.score > 0)?.guide
  },
  async startGuide(id) {
    const guide = guides.get(id)
    if (!guide) throw new Error(`Unknown guide: ${id}`)
    const completed = readCompleted()
    for (const pre of guide.prerequisites ?? []) {
      if (completed.has(pre) || !guides.has(pre)) continue
      sessionStorage.setItem(AFTER_KEY(), id)
      window.dispatchEvent(
        new CustomEvent('ops:aby-guide-started', { detail: { guideId: pre, chainedFrom: id } }),
      )
      await runStep(guides.get(pre)!, 0)
      return
    }
    window.dispatchEvent(
      new CustomEvent('ops:aby-guide-started', { detail: { guideId: id } })
    )
    await runStep(guide, 0)
  },
  stopGuide() {
    sessionStorage.removeItem(PENDING_KEY())
    activeStepCleanup?.()
    activeStepCleanup = null
    activeDriver?.destroy()
    activeDriver = null
  },
}

/** Installs the cross-bundle contract and resumes a guide after route navigation. */
export function bootstrapAbyGuidance(): void {
  ;(window as unknown as { opsGuidance: GuidanceAPI }).opsGuidance = abyGuidance
  registerWebMCPTools()
  const pending = readPending()
  if (!pending) return
  // Only guides registered synchronously before boot (host built-ins) are
  // visible here. Manifest-driven guides register later and resume from
  // registerGuide() instead — see shouldResumeOnRegister.
  const guide = guides.get(pending.guideId)
  if (guide) scheduleResume(guide, pending.stepIndex)
}

type ModelContextLike = {
  registerTool: (tool: Record<string, unknown>) => Promise<void>
}

function registerWebMCPTools(): void {
  const context = (document as unknown as { modelContext?: ModelContextLike })
    .modelContext
  if (!context) return
  void context.registerTool({
    name: 'ops.list_guides',
    title: 'Listar guías de Ops',
    description:
      'Lista los procesos que Aby puede enseñar en la pantalla actual.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () =>
      JSON.stringify(
        abyGuidance
          .listGuides()
          .map(({ id, title, description, owner }) => ({
            id,
            title,
            description,
            owner,
          }))
      ),
  })
  void context.registerTool({
    name: 'ops.start_guide',
    title: 'Iniciar guía visual',
    description:
      'Inicia una guía visual para que el usuario complete un proceso en Ops. No confirma ni modifica registros.',
    inputSchema: {
      type: 'object',
      properties: { guideId: { type: 'string', maxLength: 128 } },
      required: ['guideId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (input: { guideId?: string }) => {
      await abyGuidance.startGuide(String(input.guideId || ''))
      return JSON.stringify({ ok: true, guideId: input.guideId })
    },
  })
  void context.registerTool({
    name: 'ops.list_guide_targets',
    title: 'Listar puntos de ayuda visibles',
    description:
      'Lista únicamente los targets semánticos reales publicados por la plataforma y sus addons en esta pantalla.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify(abyGuidance.listTargets()),
  })
  void context.registerTool({
    name: 'ops.list_capabilities',
    title: 'Listar capacidades disponibles',
    description:
      'Lista capacidades reales publicadas por el kernel y los addons en la sesión, incluyendo permiso, riesgo y necesidad de confirmación.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () =>
      JSON.stringify(
        abyCapabilities.list().map(({ execute: _execute, ...capability }) => capability),
      ),
  })
  void context.registerTool({
    name: 'ops.validate_guides',
    title: 'Validar guías de la pantalla',
    description: 'Verifica qué pasos están listos, pertenecen a otra ruta o no publicaron su target.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify(abyGuidance.validateGuides()),
  })
}

declare global {
  interface Window {
    /** Stable host contract available to independently deployed federation remotes. */
    opsGuidance: GuidanceAPI
  }
}
