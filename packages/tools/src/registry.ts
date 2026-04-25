import type { ToolDef } from './types'

/**
 * Registry client-side de tools instaladas. Usualmente se hidrata una vez por
 * sesión desde `ToolClient.list()` y sirve de caché para la UI (tool pickers,
 * command palette filters, param preview).
 *
 * No ejecuta nada — solo agrega por addon_key + tool id. Para invocar,
 * combinalo con un `ToolClient.execute(...)`.
 */
export class ToolRegistry {
  private readonly byKey = new Map<string, ToolDef & { addon_key: string }>()

  /** Inserta o reemplaza. Retorna `this` para chaining. */
  register(addonKey: string, def: ToolDef): this {
    this.byKey.set(key(addonKey, def.id), { ...def, addon_key: addonKey })
    return this
  }

  /** Borra un tool específico. */
  unregister(addonKey: string, toolID: string): void {
    this.byKey.delete(key(addonKey, toolID))
  }

  /** Borra todas las tools de un addon (uninstall / reload). */
  unregisterAddon(addonKey: string): number {
    let removed = 0
    for (const k of Array.from(this.byKey.keys())) {
      if (k.startsWith(`${addonKey}#`)) {
        this.byKey.delete(k)
        removed++
      }
    }
    return removed
  }

  byID(addonKey: string, toolID: string): (ToolDef & { addon_key: string }) | undefined {
    return this.byKey.get(key(addonKey, toolID))
  }

  byAddon(addonKey: string): (ToolDef & { addon_key: string })[] {
    const out: (ToolDef & { addon_key: string })[] = []
    for (const v of this.byKey.values()) {
      if (v.addon_key === addonKey) out.push(v)
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  all(): (ToolDef & { addon_key: string })[] {
    return Array.from(this.byKey.values()).sort((a, b) => {
      if (a.addon_key !== b.addon_key) return a.addon_key.localeCompare(b.addon_key)
      return a.id.localeCompare(b.id)
    })
  }

  get size(): number {
    return this.byKey.size
  }

  clear(): void {
    this.byKey.clear()
  }
}

function key(addonKey: string, toolID: string): string {
  return `${addonKey}#${toolID}`
}
