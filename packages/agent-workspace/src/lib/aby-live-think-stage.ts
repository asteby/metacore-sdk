import { useEffect, useMemo, useRef, useState } from 'react'

export type LiveThinkTone = 'emerald' | 'amber' | 'purple' | 'zinc'

export type LiveThinkStage = {
  key: string
  icon: string
  hint: string
  tone: LiveThinkTone
}

/** Min time each thought stage stays on the live bar (ms), even if the next step arrives sooner. */
export const LIVE_THINK_STAGE_DWELL_MS = 700

function parseStep(content: string): { icon: string; hint: string } {
  const parts = content.split('|')
  if (parts.length > 1) {
    return { icon: parts[0], hint: parts.slice(1).join('|') }
  }
  return { icon: 'cog', hint: content }
}

function stageKey(icon: string): string {
  if (icon === 'brain') return 'brain'
  if (icon === 'sparkles') return 'sparkles'
  if (
    icon === 'package' ||
    icon === 'package-search' ||
    icon === 'boxes' ||
    icon === 'warehouse' ||
    icon === 'shopping-cart'
  ) {
    return 'package'
  }
  if (icon === 'cog' || !icon) return 'cog'
  return `tool:${icon}`
}

function toneFor(icon: string, key: string): LiveThinkTone {
  if (key === 'brain' || icon === 'brain') return 'purple'
  if (key === 'sparkles' || icon === 'sparkles') return 'emerald'
  if (key === 'package') return 'emerald'
  if (key === 'cog') return 'amber' // visible on dark (zinc was almost invisible)
  return 'amber'
}

/**
 * Collapse consecutive identical stage keys (esp. cog|Pensando spam) into one slot
 * so the live bar can dwell on sparkles → tools → brain → package.
 */
export function buildLiveThinkStages(
  steps: { content: string }[] | undefined | null,
): LiveThinkStage[] {
  if (!steps?.length) {
    return [
      {
        key: 'sparkles',
        icon: 'sparkles',
        hint: 'Trabajando…',
        tone: 'emerald',
      },
    ]
  }
  const out: LiveThinkStage[] = []
  for (const step of steps) {
    const { icon, hint } = parseStep(step.content || '')
    const key = stageKey(icon)
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.hint = hint || last.hint
      last.icon = icon || last.icon
      continue
    }
    out.push({
      key,
      icon: icon || 'cog',
      hint: hint || '…',
      tone: toneFor(icon, key),
    })
  }
  return out
}

/**
 * Walks thought stages with a minimum dwell so each color in the Aby gradient
 * gets a beat — without hard-cutting to the latest cog tick.
 */
export function useLiveThinkStage(
  steps: { content: string }[] | undefined | null,
  thinking: boolean,
): LiveThinkStage | undefined {
  const stages = useMemo(() => buildLiveThinkStages(steps), [steps])
  const [index, setIndex] = useState(0)
  const wasThinking = useRef(false)

  // Solo reinicia el recorrido al entrar en un turno de pensamiento nuevo.
  useEffect(() => {
    if (thinking && !wasThinking.current) setIndex(0)
    if (!thinking) setIndex(0)
    wasThinking.current = thinking
  }, [thinking])

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, stages.length - 1)))
  }, [stages.length])

  useEffect(() => {
    if (!thinking) return
    if (index >= stages.length - 1) return
    const t = window.setTimeout(() => {
      setIndex((i) => Math.min(i + 1, stages.length - 1))
    }, LIVE_THINK_STAGE_DWELL_MS)
    return () => window.clearTimeout(t)
  }, [thinking, index, stages.length])

  if (!thinking) return undefined
  return stages[Math.min(index, stages.length - 1)]
}
