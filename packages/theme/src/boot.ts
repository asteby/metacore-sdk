// Paints the theme a returning visitor last saw before the first frame.
//
// Every theme provider (dark/light, theme pack, font, density, brand color)
// resolves after the bundle runs, some after a fetch. Until then the page
// painted the defaults and then switched: a visible flash on every reload.
// The providers keep writing <html> as they do today; `watchThemeBoot`
// stores the result, and `themeBootScript()` is a small inline script for
// the top of <head> that puts it back synchronously, before any CSS or paint.
//
// This module has no React import so a Vite config can build the snippet.

export type ThemeMode = 'light' | 'dark'

/** localStorage entry holding the last resolved theme of this origin. */
export const THEME_BOOT_STORAGE_KEY = 'mc:theme-boot:v1'
/** Cookie the ThemeProvider stores the user's light/dark/system choice in. */
export const THEME_MODE_COOKIE = 'metacore-ui-theme'
/**
 * Class on <html> while the boot theme settles. Transitions are off under
 * it, so the providers re-applying the same theme can't animate anything.
 */
export const THEME_BOOTING_CLASS = 'mc-theme-booting'
/** Elements (and their subtree) that keep their transitions during boot. */
export const THEME_BOOT_TRANSITION_ATTRIBUTE = 'data-boot-transition'

/** What one mode paints: inline custom properties and generated stylesheets. */
export interface ThemeBootModeSnapshot {
  vars: Record<string, string>
  styles: Record<string, string>
  /** attrs + classes it was captured under; another value makes it stale. */
  base: string
}

export interface ThemeBootSnapshot {
  v: 1
  attrs: Record<string, string>
  classes: string[]
  modes: Partial<Record<ThemeMode, ThemeBootModeSnapshot>>
}

export interface ThemeBootScriptOptions {
  storageKey?: string
  modeCookie?: string
  /** Mode for a first visit with no cookie. `system` follows the OS. */
  defaultMode?: ThemeMode | 'system'
  /** Longest the transition lock may last if the app never releases it. */
  maxLockMs?: number
}

export interface ThemeBootWatchOptions {
  storageKey?: string
  /** <html> attributes to keep. Default: every `data-ui-*`. */
  attributePattern?: RegExp
  /** <html> classes to keep, besides light/dark. Default: `font-*`. */
  classPattern?: RegExp
  /** <style id> elements whose text is kept per mode. */
  styleIds?: string[]
}

/** The stylesheet the metacore branding provider generates. */
export const BRANDING_STYLE_ID = 'metacore-branding-surfaces'

const DEFAULT_ATTRIBUTES = /^data-ui-/
const DEFAULT_CLASSES = /^font-/

// Serialized into the inline script: no reference to anything outside it,
// and ES5 syntax only, since it runs before any polyfill.
function bootTheme(o: Required<ThemeBootScriptOptions> & { lockClass: string; allowAttr: string }) {
  var d = document
  var root = d.documentElement
  var release = function () {
    root.classList.remove(o.lockClass)
  }
  try {
    var lock = d.createElement('style')
    lock.textContent =
      'html.' + o.lockClass + ' *:not([' + o.allowAttr + ']):not([' + o.allowAttr + '] *),' +
      'html.' + o.lockClass + ' *::before,html.' + o.lockClass + ' *::after' +
      '{transition:none!important}'
    d.head.appendChild(lock)
    root.classList.add(o.lockClass)
    setTimeout(release, o.maxLockMs)

    var m = d.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(o.modeCookie) + '=([^;]*)'))
    var pref = m ? decodeURIComponent(m[1] as string) : o.defaultMode
    var dark =
      pref === 'dark' ||
      (pref !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    var mode = dark ? 'dark' : 'light'
    root.classList.remove(dark ? 'light' : 'dark')
    root.classList.add(mode)

    var raw = localStorage.getItem(o.storageKey)
    var s = raw ? JSON.parse(raw) : null
    if (!s || s.v !== 1) return
    var k
    for (k in s.attrs) {
      // Only data-* from storage: never an event-handler attribute.
      if (/^data-[\w-]+$/.test(k) && typeof s.attrs[k] === 'string') root.setAttribute(k, s.attrs[k])
    }
    for (var i = 0; i < (s.classes || []).length; i++) {
      if (typeof s.classes[i] === 'string') root.classList.add(s.classes[i])
    }
    var ms = s.modes && s.modes[mode]
    if (!ms) return
    for (k in ms.vars) {
      if (/^--[\w-]+$/.test(k)) root.style.setProperty(k, String(ms.vars[k]))
    }
    for (k in ms.styles) {
      var el = d.getElementById(k) || d.head.appendChild(d.createElement('style'))
      el.id = k
      el.textContent = String(ms.styles[k])
    }
  } catch (e) {
    // Storage blocked or corrupt entry: the providers paint as before.
  }
}

/**
 * Inline script (no <script> tag) that restores the stored theme. Put it
 * first in <head>, before the stylesheets, as a classic (not module) script.
 */
export function themeBootScript(options: ThemeBootScriptOptions = {}): string {
  const config = {
    storageKey: options.storageKey ?? THEME_BOOT_STORAGE_KEY,
    modeCookie: options.modeCookie ?? THEME_MODE_COOKIE,
    defaultMode: options.defaultMode ?? 'system',
    maxLockMs: options.maxLockMs ?? 8000,
    lockClass: THEME_BOOTING_CLASS,
    allowAttr: THEME_BOOT_TRANSITION_ATTRIBUTE,
  }
  return `(${bootTheme.toString().replace(/\n\s+/g, '\n')})(${JSON.stringify(config)});`
}

/**
 * Turns transitions back on once the app painted with its theme. Waits two
 * frames so the providers' first effects commit without animating.
 */
export function releaseThemeBoot(): void {
  if (typeof document === 'undefined') return
  const done = () => document.documentElement.classList.remove(THEME_BOOTING_CLASS)
  if (typeof requestAnimationFrame !== 'function') return done()
  requestAnimationFrame(() => requestAnimationFrame(done))
}

function currentMode(root: HTMLElement): ThemeMode {
  return root.classList.contains('dark') ? 'dark' : 'light'
}

/** Reads what <html> paints right now. */
export function captureThemeBoot(options: ThemeBootWatchOptions = {}): {
  mode: ThemeMode
  attrs: Record<string, string>
  classes: string[]
  vars: Record<string, string>
  styles: Record<string, string>
} {
  const root = document.documentElement
  const attrPattern = options.attributePattern ?? DEFAULT_ATTRIBUTES
  const classPattern = options.classPattern ?? DEFAULT_CLASSES
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(root.attributes)) {
    if (attrPattern.test(attr.name)) attrs[attr.name] = attr.value
  }
  const classes = Array.from(root.classList).filter((c) => classPattern.test(c)).sort()
  const vars: Record<string, string> = {}
  for (let i = 0; i < root.style.length; i++) {
    const prop = root.style.item(i)
    if (prop.startsWith('--')) vars[prop] = root.style.getPropertyValue(prop).trim()
  }
  const styles: Record<string, string> = {}
  for (const id of options.styleIds ?? [BRANDING_STYLE_ID]) {
    const el = document.getElementById(id)
    if (el instanceof HTMLStyleElement && el.textContent) styles[id] = el.textContent
  }
  return { mode: currentMode(root), attrs, classes, vars, styles }
}

function readSnapshot(key: string): ThemeBootSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as ThemeBootSnapshot) : null
    return parsed && parsed.v === 1 ? parsed : null
  } catch {
    return null
  }
}

/**
 * Stores the current theme for the next load. The other mode's entry is
 * kept only while the pack/font/density it was taken under still holds.
 * Returns false when nothing changed.
 */
export function persistThemeBoot(options: ThemeBootWatchOptions = {}): boolean {
  if (typeof document === 'undefined') return false
  const key = options.storageKey ?? THEME_BOOT_STORAGE_KEY
  const now = captureThemeBoot(options)
  const base = JSON.stringify([now.attrs, now.classes])
  const prev = readSnapshot(key)
  const modes: ThemeBootSnapshot['modes'] = {}
  const other: ThemeMode = now.mode === 'dark' ? 'light' : 'dark'
  const kept = prev?.modes[other]
  if (kept && kept.base === base) modes[other] = kept
  modes[now.mode] = { vars: now.vars, styles: now.styles, base }
  const next: ThemeBootSnapshot = { v: 1, attrs: now.attrs, classes: now.classes, modes }
  const serialized = JSON.stringify(next)
  try {
    if (localStorage.getItem(key) === serialized) return false
    localStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}

/**
 * Keeps the stored theme in sync with <html>: any provider that changes a
 * class, a data-ui-* attribute, an inline custom property or a watched
 * stylesheet triggers one write per task. Returns the unsubscribe.
 */
export function watchThemeBoot(options: ThemeBootWatchOptions = {}): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const styleIds = new Set(options.styleIds ?? [BRANDING_STYLE_ID])
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      persistThemeBoot(options)
    }, 0)
  }
  const inWatchedStyle = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement
    return !!el && el.tagName === 'STYLE' && styleIds.has(el.id)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target === document.documentElement && record.type === 'attributes') {
        return schedule()
      }
      if (inWatchedStyle(record.target)) return schedule()
      for (const node of Array.from(record.addedNodes)) {
        if (inWatchedStyle(node)) return schedule()
      }
    }
  })
  observer.observe(document.documentElement, { attributes: true })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  schedule()
  return () => observer.disconnect()
}
