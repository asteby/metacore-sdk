export interface DraftAttachmentRef {
  id: string
  name: string
  size?: number
}

export interface Draft {
  text: string
  subject?: string
  identityId?: string
  attachments?: DraftAttachmentRef[]
}

/** Persistence adapter: back it with localStorage, IndexedDB or your API. */
export interface DraftStore {
  load(key: string): Draft | null | Promise<Draft | null>
  save(key: string, draft: Draft): void | Promise<void>
  remove(key: string): void | Promise<void>
  /** Remove every draft this store owns. Hosts must call it on logout / account switch. */
  clear?(): void | Promise<void>
}

/**
 * localStorage-backed drafts. Drafts hold message text in clear and live in a
 * browser-shared store, so scope them per user/tenant with `prefix` (e.g.
 * `metacore.inbox.draft:${userId}:`) and call `store.clear()` on logout.
 */
export function createLocalDraftStore(prefix = 'metacore.inbox.draft:'): DraftStore {
  const get = () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }
  return {
    load(key) {
      try {
        const raw = get()?.getItem(prefix + key)
        return raw ? (JSON.parse(raw) as Draft) : null
      } catch {
        return null
      }
    },
    save(key, draft) {
      try {
        get()?.setItem(prefix + key, JSON.stringify(draft))
      } catch {
        /* quota or private mode: drafts are best-effort */
      }
    },
    remove(key) {
      try {
        get()?.removeItem(prefix + key)
      } catch {
        /* ignore */
      }
    },
    clear() {
      try {
        const ls = get()
        if (!ls) return
        const owned: string[] = []
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i)
          if (k?.startsWith(prefix)) owned.push(k)
        }
        owned.forEach((k) => ls.removeItem(k))
      } catch {
        /* ignore */
      }
    },
  }
}
