import { useId, useRef, type KeyboardEvent } from 'react'

const PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z'

function Star({ fill }: { fill: number }) {
  // `fill` 0..1: a clipped copy over an outline, so half stars render without a second asset.
  const id = useId()
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" data-sf-star="">
      <path d={PATH} data-sf-star-bg="" />
      {fill > 0 ? (
        <>
          <clipPath id={id}>
            <rect x="0" y="0" width={24 * Math.min(1, fill)} height="24" />
          </clipPath>
          <path d={PATH} data-sf-star-fg="" clipPath={`url(#${id})`} />
        </>
      ) : null}
    </svg>
  )
}

/** Read-only stars (`value` 0-5, halves allowed). The accessible name is `label`; the glyphs are hidden from AT. */
export function ReviewStars({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span data-sf-stars="" role="img" aria-label={label} className={className}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.max(0, Math.min(1, value - i))} />
      ))}
    </span>
  )
}

/**
 * Rating input: an ARIA radio group (one tab stop; arrows, Home and End move and select, as native radios do).
 * `value` 0 = nothing chosen yet.
 */
export function StarInput({
  value,
  onChange,
  label,
  describedBy,
  starLabel,
  invalid,
  className,
}: {
  value: number
  onChange: (n: number) => void
  label: string
  describedBy?: string
  starLabel: (n: number) => string
  invalid?: boolean
  className?: string
}) {
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const focusable = value >= 1 ? value : 1
  const move = (to: number) => {
    const n = Math.max(1, Math.min(5, to))
    onChange(n)
    refs.current[n - 1]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault()
        return move((value || 0) + 1)
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault()
        return move((value || 2) - 1)
      case 'Home':
        e.preventDefault()
        return move(1)
      case 'End':
        e.preventDefault()
        return move(5)
    }
  }
  return (
    <span data-sf-star-input="" role="radiogroup" aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required="true" className={className} onKeyDown={onKey}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el
          }}
          role="radio"
          aria-checked={value === n}
          aria-label={starLabel(n)}
          tabIndex={n === focusable ? 0 : -1}
          data-active={n <= value ? '' : undefined}
          onClick={() => onChange(n)}
        >
          <Star fill={n <= value ? 1 : 0} />
        </span>
      ))}
    </span>
  )
}
