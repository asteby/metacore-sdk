// Node 26 exposes a global localStorage getter that returns undefined unless
// --localStorage-file is set, and that getter hides happy-dom's storage.
// Tests that persist page size or the metadata cache need a real Storage.

function installMemoryStorage(name: 'localStorage' | 'sessionStorage') {
    const current = globalThis[name] as Storage | undefined
    if (current && typeof current.clear === 'function' && typeof current.setItem === 'function') return
    const store = new Map<string, string>()
    const memory: Storage = {
        getItem: (key) => (store.has(key) ? store.get(key)! : null),
        setItem: (key, value) => {
            store.set(String(key), String(value))
        },
        removeItem: (key) => {
            store.delete(String(key))
        },
        clear: () => {
            store.clear()
        },
        key: (index) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size
        },
    }
    Object.defineProperty(globalThis, name, { value: memory, configurable: true, writable: true })
}

installMemoryStorage('localStorage')
installMemoryStorage('sessionStorage')

// `waitFor` defaults to 1s; the DynamicTable/DynamicKanban suites render large
// trees and miss it when the whole monorepo's tests run in parallel (turbo).
// A longer ceiling only affects failing waits, passing tests return immediately.
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 5000 })

// Scoped caches (metadata store, query batch) fail closed without an
// org:user:lang identity. Give every test one by default; the cache-scope
// suites remove or change it explicitly.
import { beforeEach } from 'vitest'

beforeEach(() => {
    try {
        if (!localStorage.getItem('auth_user')) {
            localStorage.setItem('auth_user', JSON.stringify({ id: 'u-test', organization_id: 'o-test' }))
        }
        if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'en')
    } catch {
        /* storage unavailable */
    }
})
