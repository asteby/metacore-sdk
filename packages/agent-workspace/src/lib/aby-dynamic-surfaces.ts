import { useEffect, type RefObject } from 'react'
import { abyGuidance, resolveGuideRoute } from './aby-guidance'
import { abyCapabilities } from './aby-capability-registry'

function esc(value: string): string {
  return CSS.escape(value)
}

/** Field hint used to stamp `data-aby-field` on dynamic modal rows. */
export type AbyFieldHint = { key: string; label?: string }

/**
 * Active record dialog. Nested create portals stack; prefer the form that
 * already carries our Aby contract, then the deepest [role=dialog].
 * Exported for guidance resolveTarget (no hardcoded form id — nested create
 * uses React useId()).
 */
export function findAbyRecordDialog(model?: string, mode?: string): Element | null {
  if (model && mode) {
    const stamped = document.querySelector(
      `[data-aby-record-form][data-aby-model="${esc(model)}"][data-aby-mode="${esc(mode)}"]`,
    )
    if (stamped) return stamped.closest('[role="dialog"]') ?? stamped
  }
  const forms = document.querySelectorAll('[data-aby-record-form]')
  if (forms.length > 0) {
    const form = forms[forms.length - 1]
    return form.closest('[role="dialog"]') ?? form
  }
  const dialogs = document.querySelectorAll('[role="dialog"]')
  return dialogs[dialogs.length - 1] ?? null
}

export function findAbyRecordForm(model?: string, mode?: string): HTMLFormElement | null {
  if (model && mode) {
    const scoped = document.querySelector<HTMLFormElement>(
      `form[data-aby-record-form][data-aby-model="${esc(model)}"][data-aby-mode="${esc(mode)}"]`,
    )
    if (scoped) return scoped
  }
  const dialog = findAbyRecordDialog(model, mode)
  const fromDialog = dialog?.querySelector<HTMLFormElement>('form')
  if (fromDialog) return fromDialog
  const all = document.querySelectorAll<HTMLFormElement>('form[data-aby-record-form], [role="dialog"] form')
  return all[all.length - 1] ?? null
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Stamps stable Aby markers on the open create/edit form so guidance can find
 * fields without a hardcoded form id and without relying on input `name`
 * (DynamicRecordDialog is controlled and often omits native name attrs).
 */
export function annotateAbyRecordForm(
  model: string,
  mode: string,
  fields: AbyFieldHint[] = [],
): boolean {
  const form = findAbyRecordForm(model, mode)
  if (!form) return false
  form.setAttribute('data-aby-record-form', '')
  form.setAttribute('data-aby-model', model)
  form.setAttribute('data-aby-mode', mode)

  for (const field of fields) {
    if (!field.key) continue
    if (form.querySelector(`[data-aby-field="${esc(field.key)}"]`)) continue

    const byName = form.querySelector(
      `[name="${esc(field.key)}"], #${esc(field.key)}`,
    )
    if (byName) {
      const row = byName.closest('.flex.flex-col') ?? byName
      if (row instanceof Element) row.setAttribute('data-aby-field', field.key)
      continue
    }

    const labelText = field.label?.trim()
    if (!labelText) continue
    const want = normalizeLabel(labelText)
    for (const label of form.querySelectorAll('label')) {
      const got = normalizeLabel(label.textContent || '')
      if (!got || (got !== want && !got.startsWith(want))) continue
      const row = label.closest('.flex.flex-col') ?? label.parentElement
      if (row instanceof Element) {
        row.setAttribute('data-aby-field', field.key)
        break
      }
    }
  }
  return true
}

/** Publishes the stable capabilities shared by every SDK DynamicTable. */
export function useAbyTableSurface(
  model: string,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const prefix = `model.${model}`
    const slug = model.toLowerCase().replace(/[^a-z0-9._-]+/g, '_')
    const owner = model.includes('.') ? model.split('.')[0].toLowerCase() : 'core'
    const within = (selector: string) => rootRef.current?.querySelector(selector) ?? null
    const cleanups = [
      abyGuidance.registerTarget(`${prefix}.table`, () => within('table') ?? rootRef.current),
      abyGuidance.registerTarget(`${prefix}.search`, () =>
        within('input[type="search"], input[placeholder*="Buscar" i], input[placeholder*="Search" i]'),
      ),
      abyGuidance.registerTarget(`${prefix}.rows`, () => within('tbody')),
      abyGuidance.registerTarget(`${prefix}.filters`, () =>
        within('[role="toolbar"], [data-slot="table-toolbar"]'),
      ),
      abyGuidance.registerTarget(`${prefix}.bulk-actions`, () => within('[role="toolbar"]')),
      // Host CTA + SDK ModelActionToolbar both stamp data-aby-target; resolve by attribute.
      abyGuidance.registerTarget(
        `${prefix}.create`,
        () =>
          document.querySelector(`[data-aby-target="${esc(`${prefix}.create`)}"]`) ??
          within(`[data-aby-target="${esc(`${prefix}.create`)}"]`),
      ),
      // Create-form targets (fields, submit…) only exist while the dialog is
      // open: if a step needs one and it is closed, open it via the CTA.
      // Detect the open form via data-aby-record-form / dialog form — never the
      // legacy #dynamic-record-form id (nested create uses React useId()).
      abyGuidance.registerRevealer(`${prefix}.create.`, () => {
        if (findAbyRecordForm(model, 'create')) return false
        const cta = document.querySelector<HTMLElement>(`[data-aby-target="${esc(`${prefix}.create`)}"]`)
        if (!cta || cta.matches(':disabled')) return false
        cta.click()
        return true
      }),
      abyCapabilities.registerMany([
        {
          id: `${owner}.${slug}.list`, owner, title: `Consultar ${model}`,
          description: `Consulta los registros disponibles de ${model}.`, kind: 'answer', risk: 'none',
          permission: `${slug}.index`, route: window.location.pathname, tags: ['model', 'table', model],
        },
        {
          id: `${owner}.${slug}.create`, owner, title: `Crear ${model}`,
          description: `Propone la creación de un registro de ${model}.`, kind: 'transact', risk: 'medium',
          permission: `${slug}.create`, route: window.location.pathname, requiresConfirmation: true,
          reversible: true, tags: ['model', 'create', model],
        },
        {
          id: `${owner}.${slug}.update`, owner, title: `Editar ${model}`,
          description: `Propone cambios sobre un registro de ${model}.`, kind: 'transact', risk: 'medium',
          permission: `${slug}.update`, route: window.location.pathname, requiresConfirmation: true,
          reversible: true, tags: ['model', 'update', model],
        },
        {
          id: `${owner}.${slug}.delete`, owner, title: `Eliminar ${model}`,
          description: `Propone eliminar un registro de ${model}.`, kind: 'transact', risk: 'high',
          permission: `${slug}.delete`, route: window.location.pathname, requiresConfirmation: true,
          reversible: false, tags: ['model', 'delete', model],
        },
      ]),
    ]
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [model, rootRef])
}

/**
 * SDK dialogs render through a portal, so the host annotates the active portal
 * rather than wrapping it. Field keys come from metadata and remain stable
 * across translations, themes and addon releases.
 */
export function useAbyRecordDialogSurface(options: {
  model: string
  mode: 'view' | 'edit' | 'create'
  open: boolean
  fieldKeys?: string[]
  /** Optional labels (from modal metadata) so we can stamp rows before the SDK ships data-aby-field. */
  fields?: AbyFieldHint[]
}): void {
  const { model, mode, open, fieldKeys = [], fields = [] } = options
  const fieldKeySignature = fieldKeys.join('\u0000')
  const fieldHintSignature = fields.map((f) => `${f.key}:${f.label ?? ''}`).join('\u0000')
  useEffect(() => {
    if (!open) return
    const prefix = `model.${model}.${mode}`
    const hints: AbyFieldHint[] =
      fields.length > 0
        ? fields
        : fieldKeySignature
            .split('\u0000')
            .filter(Boolean)
            .map((key) => ({ key }))

    const dialog = () => findAbyRecordDialog(model, mode)
    const resolveField = (key: string) => {
      annotateAbyRecordForm(model, mode, hints)
      return (
        dialog()?.querySelector(`[data-aby-field="${esc(key)}"]`) ??
        dialog()?.querySelector(`[name="${esc(key)}"], #${esc(key)}, [aria-label="${esc(key)}"]`) ??
        null
      )
    }

    // Keep stamping while the dialog skeleton → form transition mounts fields.
    annotateAbyRecordForm(model, mode, hints)
    const observer = new MutationObserver(() => {
      annotateAbyRecordForm(model, mode, hints)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const cleanups = [
      () => observer.disconnect(),
      abyGuidance.registerTarget(`${prefix}.dialog`, dialog),
      abyGuidance.registerTarget(
        `${prefix}.form`,
        () => findAbyRecordForm(model, mode) ?? dialog(),
      ),
      abyGuidance.registerTarget(`${prefix}.submit`, () =>
        dialog()?.querySelector(
          `button[type="submit"][form], button[type="submit"]`,
        ) ?? null,
      ),
      abyGuidance.registerTarget(`${prefix}.cancel`, () =>
        dialog()?.querySelector('button[type="button"]') ?? null,
      ),
      ...hints.map((field) =>
        abyGuidance.registerTarget(`${prefix}.field.${field.key}`, () => resolveField(field.key)),
      ),
    ]
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [fieldHintSignature, fieldKeySignature, mode, model, open])
}

/**
 * Sidebar anchors render the ROUTER href, i.e. with the SPA basepath
 * ("/app/m/customers") and serialized search, while nav items carry the
 * basepath-less URL ("/m/customers"). Compare both forms. Exported for tests.
 */
export function sidebarHrefMatches(href: string | null, url: string, base?: string): boolean {
  if (!href) return false
  return href === url || href === resolveGuideRoute(url, base)
}

function findSidebarAnchor(url: string): Element | null {
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (sidebarHrefMatches(anchor.getAttribute('href'), url)) return anchor
  }
  return null
}

/** Makes every visible native/addon sidebar destination addressable by URL. */
export function annotateAbySidebarTargets(urls: string[]): () => void {
  const touched = new Set<Element>()
  const sync = () => {
    for (const url of urls) {
      const anchor = findSidebarAnchor(url)
      if (!anchor || anchor.getAttribute('data-aby-target') === `navigation.${url}`) continue
      anchor.setAttribute('data-aby-target', `navigation.${url}`)
      touched.add(anchor)
    }
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    touched.forEach((element) => element.removeAttribute('data-aby-target'))
  }
}

function waitFor<T>(probe: () => T | null, timeoutMs = 1_000): Promise<T | null> {
  return new Promise((resolve) => {
    const started = performance.now()
    const tick = () => {
      const value = probe()
      if (value || performance.now() - started > timeoutMs) return resolve(value)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

/** Collapsible trigger (Radix sets aria-expanded) whose label is `title`. */
function findCollapsibleTrigger(
  scope: ParentNode,
  title: string,
  skip: Set<Element>,
): HTMLElement | null {
  for (const el of scope.querySelectorAll<HTMLElement>('[aria-expanded]')) {
    if (skip.has(el)) continue
    if (el.querySelector('span')?.textContent?.trim() === title) return el
  }
  return null
}

/**
 * Expands the sidebar groups that contain `url` so its anchor exists in the
 * DOM (Radix Collapsible unmounts closed content). `parentTitles` is the chain
 * of collapsible labels from the group root down to the leaf. Returns true
 * when it clicked anything. Exported for tests.
 */
export async function expandSidebarPath(parentTitles: string[]): Promise<boolean> {
  let scope: ParentNode =
    (await waitFor(() => document.querySelector('[data-sidebar="sidebar"]'))) ?? document
  const used = new Set<Element>()
  let acted = false
  for (const title of parentTitles) {
    const trigger = findCollapsibleTrigger(scope, title, used)
    if (!trigger) break
    used.add(trigger)
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      trigger.click()
      acted = true
      await waitFor(() => (trigger.getAttribute('aria-expanded') === 'true' ? trigger : null))
    }
    scope = trigger.closest('li') ?? scope
  }
  return acted
}

/**
 * Lets guide steps target sidebar leaves hidden in collapsed groups (or in a
 * closed/icon-only sidebar): opens the sidebar, then expands the path.
 */
export function registerAbySidebarRevealer(
  parentTitlesByUrl: Map<string, string[]>,
  ensureSidebarOpen: () => boolean,
): () => void {
  return abyGuidance.registerRevealer('navigation.', async (name) => {
    const url = name.slice('navigation.'.length)
    const chain = parentTitlesByUrl.get(url)
    if (!chain) return false
    const opened = ensureSidebarOpen()
    return (await expandSidebarPath(chain)) || opened
  })
}
