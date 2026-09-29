/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
})

// A fresh module copy stands for a page reload.
async function fresh() {
  vi.resetModules()
  return import('../nav-open-state')
}

describe('remembered sidebar folders', () => {
  beforeEach(() => memory.clear())

  it('a folder the user opened is open after a reload; a closed one is not', async () => {
    const before = await fresh()
    before.rememberNavFolderOpen('Módulos/CRM', true)
    before.rememberNavFolderOpen('Módulos/Inventario', true)
    before.rememberNavFolderOpen('Módulos/Inventario', false)
    const after = await fresh()
    expect(after.wasNavFolderOpen('Módulos/CRM')).toBe(true)
    expect(after.wasNavFolderOpen('Módulos/Inventario')).toBe(false)
  })

  it('survives a corrupt entry', async () => {
    memory.set('mc:ui:nav-open:v1', '{oops')
    const mod = await fresh()
    expect(mod.wasNavFolderOpen('x')).toBe(false)
    mod.rememberNavFolderOpen('x', true)
    expect(mod.wasNavFolderOpen('x')).toBe(true)
  })
})
