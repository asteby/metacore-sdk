/** Last time the person opened each ticket (ms epoch), so the list can flag replies they have not seen. */
export type SeenMap = Record<string, number>

const KEY = 'metacore-support-seen:'
const MAX = 200

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadSeen(channel: string): SeenMap {
  try {
    const raw = store()?.getItem(KEY + channel)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    if (!v || typeof v !== 'object') return {}
    const out: SeenMap = {}
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
    return out
  } catch {
    return {}
  }
}

/** Records a visit and returns the new map (storage failures are ignored: unread just falls back to "new replies"). */
export function markSeen(channel: string, cur: SeenMap, id: string, now: number = Date.now()): SeenMap {
  const next: SeenMap = { ...cur, [id]: now }
  const keys = Object.keys(next)
  if (keys.length > MAX) for (const k of keys.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0)).slice(0, keys.length - MAX)) delete next[k]
  try {
    store()?.setItem(KEY + channel, JSON.stringify(next))
  } catch {
    // Storage blocked or full.
  }
  return next
}
