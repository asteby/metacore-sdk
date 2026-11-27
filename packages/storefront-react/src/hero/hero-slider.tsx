import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'
import { fillHeroText, heroMessages, type HeroMessages } from './messages.js'

export type HeroSliderClassNames = {
  root?: string
  track?: string
  slide?: string
  controls?: string
  button?: string
  dot?: string
}

export type HeroSliderProps = {
  /** One node per slide, in order. The first one is the one the server paints (and the LCP). */
  slides: readonly ReactNode[]
  /** Accessible name of the carousel; default from the messages («Campañas» / «Campaigns»). */
  label?: string
  /** Auto-advance every `intervalMs` (default 6000). `false` turns it off for good. */
  autoplay?: boolean
  intervalMs?: number
  /** Locale of the built-in texts (default: the provider's). */
  locale?: string
  /** Overrides for any text (`heroMessages`). */
  messages?: Partial<HeroMessages>
  prevIcon?: ReactNode
  nextIcon?: ReactNode
  className?: string
  classNames?: HeroSliderClassNames
}

const cx = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ') || undefined

/**
 * Scroll-snap track of slides: without JavaScript it swipes (and the server paints the first slide); with it, it adds
 * arrows, dots, a pause button, ← → keys and auto-advance. Auto-advance stops with `prefers-reduced-motion`, on hover or
 * focus inside, while the tab is hidden and when the visitor pauses it (WCAG 2.2.2). A single slide paints no controls.
 * Style with `@asteby/storefront-react/hero.css` and `classNames`.
 */
export function HeroSlider({
  slides,
  label,
  autoplay = true,
  intervalMs = 6000,
  locale,
  messages,
  prevIcon = <span aria-hidden="true">‹</span>,
  nextIcon = <span aria-hidden="true">›</span>,
  className,
  classNames,
}: HeroSliderProps) {
  const loc = useResolvedLocale(locale)
  const m = heroMessages(loc, messages)
  const track = useRef<HTMLUListElement>(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hold, setHold] = useState(false)
  const [reduced, setReduced] = useState(true) // until known: no motion
  const total = slides.length

  const goTo = (i: number, smooth = true) => {
    const el = track.current
    if (!el || total === 0) return
    const next = (i + total) % total
    el.scrollTo?.({ left: next * el.clientWidth, behavior: smooth && !reduced ? 'smooth' : 'auto' })
    setIndex(next)
  }

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) {
      setReduced(prefersReducedMotion())
      return
    }
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // The index follows the scroll (finger, keys or buttons).
  useEffect(() => {
    const el = track.current
    if (!el) return
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const auto = autoplay && total > 1 && !reduced && !paused && !hold
  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') goTo(index + 1)
    }, intervalMs)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, index, intervalMs, total])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (total < 2) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(index - 1)
    }
  }

  if (total === 0) return null
  const name = (i: number) => fillHeroText(m['hero.slide'], { index: i + 1, count: total })
  return (
    <div
      data-sf-hero=""
      data-state={total > 1 ? 'multiple' : 'single'}
      className={cx(className, classNames?.root)}
      role="group"
      aria-roledescription={m['hero.roledescription']}
      aria-label={label ?? m['hero.label']}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      onKeyDown={onKeyDown}
    >
      <ul data-sf-hero-track="" ref={track} role="list" aria-live={auto ? 'off' : 'polite'} className={classNames?.track}>
        {slides.map((s, i) => (
          <li key={i} data-sf-hero-slide="" role="group" aria-roledescription={m['hero.slide.roledescription']} aria-label={name(i)} className={classNames?.slide}>
            {s}
          </li>
        ))}
      </ul>
      {total > 1 ? (
        <>
          <button type="button" data-sf-hero-arrow="prev" onClick={() => goTo(index - 1)} aria-label={m['hero.previous']} className={classNames?.button}>
            {prevIcon}
          </button>
          <button type="button" data-sf-hero-arrow="next" onClick={() => goTo(index + 1)} aria-label={m['hero.next']} className={classNames?.button}>
            {nextIcon}
          </button>
          <div data-sf-hero-controls="" className={classNames?.controls}>
            {slides.map((_, i) => (
              <button key={i} type="button" data-sf-hero-dot="" onClick={() => goTo(i)} aria-label={name(i)} aria-current={i === index ? 'true' : undefined} className={classNames?.dot}>
                <span aria-hidden="true" />
              </button>
            ))}
            {autoplay ? (
              <button type="button" data-sf-hero-pause="" onClick={() => setPaused((p) => !p)} aria-label={paused ? m['hero.play'] : m['hero.pause']} aria-pressed={paused} className={classNames?.button}>
                <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
