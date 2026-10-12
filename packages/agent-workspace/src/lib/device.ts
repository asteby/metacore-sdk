/** Phone / tablet / touch Mac (iPadOS) — media APIs behave differently than desktop. */
export function isMobileLikeClient(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ reports as Macintosh with touch.
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true
  return false
}
