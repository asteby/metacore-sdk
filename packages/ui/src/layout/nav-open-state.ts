import { useCallback, useState } from 'react'

/**
 * Which sidebar folders the user left open, kept across page loads. A folder
 * opens on mount when it holds the active page OR the user had it open, so a
 * reload paints the same tree the user left instead of collapsing everything
 * but the active branch.
 */
const STORE_KEY = 'mc:ui:nav-open:v1'
const STORE_MAX = 200

let openIds: string[] | null = null

function load(): string[] {
  if (openIds) return openIds
  openIds = []
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '[]')
    if (Array.isArray(parsed)) openIds = parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    /* private mode / corrupt entry */
  }
  return openIds
}

function save(ids: string[]): void {
  openIds = ids.slice(-STORE_MAX)
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(openIds))
  } catch {
    /* quota: the state just is not remembered */
  }
}

export function wasNavFolderOpen(id: string): boolean {
  return load().includes(id)
}

export function rememberNavFolderOpen(id: string, open: boolean): void {
  const rest = load().filter((x) => x !== id)
  save(open ? [...rest, id] : rest)
}

/** Controlled open state for a sidebar folder, remembered by `id`. */
export function useNavFolderOpen(
  id: string,
  containsActive: boolean,
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => containsActive || wasNavFolderOpen(id))
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      rememberNavFolderOpen(id, next)
    },
    [id],
  )
  return [open, onOpenChange]
}
