import { describe, expect, it } from 'vitest'

// Shim de localStorage en memoria, instalado ANTES de importar el store
// (mismo patrón que provider.test.tsx: environment node, sin jsdom).
const memory = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i: number) => Array.from(memory.keys())[i] ?? null,
  get length() {
    return memory.size
  },
}

const { getTypedAuthStore, useAuthStore } = await import('../store')
type BaseAuthUser = import('../store').BaseAuthUser

interface HostUser extends BaseAuthUser {
  doctor_id?: number
  onboarding_completed?: boolean
}

describe('getTypedAuthStore', () => {
  it('returns the exact same singleton (type-level cast only)', () => {
    const typed = getTypedAuthStore<HostUser>()
    expect(typed).toBe(useAuthStore)
  })

  it('shares state with the untyped store across setUser/reset', () => {
    const typed = getTypedAuthStore<HostUser>()
    typed.getState().auth.setUser({
      id: '7',
      email: 'doc@example.com',
      name: 'Doc',
      role: 'doctor',
      doctor_id: 7,
    })
    // Visible desde el singleton sin tipar — misma instancia de estado.
    expect(useAuthStore.getState().auth.user?.email).toBe('doc@example.com')
    expect(typed.getState().auth.user?.doctor_id).toBe(7)

    typed.getState().auth.setAccessToken('tok-123')
    expect(useAuthStore.getState().auth.accessToken).toBe('tok-123')

    useAuthStore.getState().auth.reset()
    expect(typed.getState().auth.user).toBeNull()
    expect(typed.getState().auth.accessToken).toBe('')
  })
})
