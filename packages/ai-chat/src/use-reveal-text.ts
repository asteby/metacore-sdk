import { useEffect, useRef, useState } from 'react'

/** Frames a full reveal takes (~0.8s at 60fps), whatever the reply length. */
const REVEAL_FRAMES = 48

/** Characters added per frame so any reply finishes in REVEAL_FRAMES. */
export function revealStep(length: number): number {
  return Math.max(3, Math.ceil(length / REVEAL_FRAMES))
}

/**
 * Cut at the last whitespace before `n` so a half-typed word (or a half
 * `**bold**` marker) doesn't flash as literal text mid-reveal.
 */
export function revealSlice(content: string, n: number): string {
  if (n >= content.length) return content
  const cut = content.lastIndexOf(' ', n)
  return content.slice(0, cut > 0 ? cut : n)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Types a freshly received reply in instead of dropping it whole. The chat
 * endpoint answers in one piece, so this is presentation only: it runs once
 * per mount, never for history, and not at all under reduced motion. Later
 * edits to the content (a decision suffix) show immediately.
 */
export function useRevealText(
  content: string,
  fresh: boolean,
  onFrame?: () => void,
): { text: string; revealing: boolean } {
  const [done, setDone] = useState(() => !fresh || prefersReducedMotion())
  const [shown, setShown] = useState(0)
  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  })

  useEffect(() => {
    if (done) return
    const step = revealStep(content.length)
    let n = 0
    let raf = 0
    const tick = () => {
      n = Math.min(content.length, n + step)
      setShown(n)
      onFrameRef.current?.()
      if (n < content.length) raf = requestAnimationFrame(tick)
      else setDone(true)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [content, done])

  const revealing = !done && shown < content.length
  return { text: revealing ? revealSlice(content, shown) : content, revealing }
}
