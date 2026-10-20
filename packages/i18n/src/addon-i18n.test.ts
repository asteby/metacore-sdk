import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The module wires its window listener at import time, so each test imports a
// fresh copy after stubbing a window + localStorage.
function stubBrowser() {
  const target = new EventTarget()
  const store = new Map<string, string>()
  const storage = {
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
  vi.stubGlobal('window', target)
  vi.stubGlobal('localStorage', storage)
  return { target, store }
}

describe('addon i18n coherence', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invalidateAddonI18n(key) removes only that addon from localStorage', async () => {
    const { store } = stubBrowser()
    store.set('metacore.addon-i18n:https://hub|crm|es', '{"labels":{"name":"CRM"},"storedAt":1}')
    store.set('metacore.addon-i18n:https://hub|pos|es', '{"labels":{"name":"POS"},"storedAt":1}')
    store.set('unrelated', 'keep')
    const { invalidateAddonI18n } = await import('./addon-i18n')
    invalidateAddonI18n('crm')
    expect([...store.keys()].sort()).toEqual(['metacore.addon-i18n:https://hub|pos|es', 'unrelated'])
  })

  it('invalidateAddonI18n() with no key drops every cached bundle but nothing else', async () => {
    const { store } = stubBrowser()
    store.set('metacore.addon-i18n:https://hub|crm|es', 'x')
    store.set('metacore.addon-i18n:https://hub|pos|en', 'x')
    store.set('other', 'keep')
    const { invalidateAddonI18n } = await import('./addon-i18n')
    invalidateAddonI18n()
    expect([...store.keys()]).toEqual(['other'])
  })

  it('a cache-epoch change event drops the cached bundles', async () => {
    const { target, store } = stubBrowser()
    store.set('metacore.addon-i18n:https://hub|crm|es', '{"labels":{"name":"CRM"},"storedAt":1}')
    await import('./addon-i18n')
    target.dispatchEvent(new CustomEvent('metacore:cache-epoch-changed', { detail: { epoch: 'b', previous: 'a', source: 'header' } }))
    expect(store.size).toBe(0)
  })

  it('survives a localStorage that throws', async () => {
    const { target } = stubBrowser()
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new Error('denied')
      },
    })
    const { invalidateAddonI18n } = await import('./addon-i18n')
    expect(() => invalidateAddonI18n('crm')).not.toThrow()
    expect(() => target.dispatchEvent(new CustomEvent('metacore:cache-epoch-changed', { detail: {} }))).not.toThrow()
  })
})
