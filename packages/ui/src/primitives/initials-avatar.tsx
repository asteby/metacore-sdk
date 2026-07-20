import * as React from 'react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/get-initials'
import { optionColor } from '@/lib/option-colors'

export interface InitialsAvatarProps {
  /** The name/label the initials and background color are derived from. */
  name: string | null | undefined
  /** Box side in pixels. Default 24 (the dynamic-table cell size). */
  size?: number
  /** Corner style. `sm` for square-ish reference thumbnails (table/picker),
   *  `full` for round person/brand avatars. Default `sm`. */
  rounded?: 'full' | 'sm'
  /** Background treatment. `auto` derives a per-name color from the shared
   *  palette hash — meaningful for a small, stable set of values (categories,
   *  statuses) where the color itself distinguishes them. `neutral` paints every
   *  avatar the same muted surface, for open-ended references (products,
   *  warehouses, customers) where hundreds of rows would otherwise render as a
   *  rainbow of colors that carry no meaning. Default `auto`. */
  tone?: 'auto' | 'neutral'
  className?: string
  title?: string
}

/**
 * Deterministic initials avatar — the SHARED fallback for a reference/option
 * that carries NO image. Instead of an empty placeholder box, it shows 1–2
 * uppercase initials of `name` on a background color derived from that same
 * string, so the swatch is STABLE per name (equal names always share a color)
 * and needs no color from the backend.
 *
 * One component, three surfaces: the relation picker (`OptionThumb`/`OptionLead`),
 * the dynamic-table relation cell (`RelationCell`) and the read-only detail
 * dialog all render this so the imageless case never diverges. Color + initials
 * funnel through the same `optionColor` (FNV-1a hash → curated Tailwind-500
 * palette) and `getInitials` helpers every other avatar in the platform uses.
 *
 * White text over the palette's 500-weight hues reads on both light and dark
 * backgrounds, so `tone='auto'` needs no theme branch; `tone='neutral'` uses the
 * `muted` tokens, which already carry their own light/dark values.
 *
 * The three relation surfaces pass `tone='neutral'`: a per-name color only says
 * something when the value set is small and stable (a category, a status). For
 * an open-ended reference it is noise — a listing of products or warehouses
 * turns into one color per row.
 */
export const InitialsAvatar: React.FC<InitialsAvatarProps> = ({
  name,
  size = 24,
  rounded = 'sm',
  tone = 'auto',
  className,
  title,
}) => {
  const initials = getInitials(name, { max: 2 })
  const isNeutral = tone === 'neutral'
  // optionColor returns a 6-digit hex WITHOUT a leading '#'.
  const hex = optionColor(name ?? '')
  return (
    <span
      aria-hidden
      title={title}
      data-slot='initials-avatar'
      data-tone={tone}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none',
        // Neutral rides the theme tokens so it tracks light/dark on its own;
        // auto keeps white-on-500 which reads against every palette hue.
        isNeutral ? 'bg-muted text-muted-foreground' : 'text-white',
        rounded === 'full' ? 'rounded-full' : 'rounded-sm',
        className
      )}
      style={{
        width: size,
        height: size,
        ...(isNeutral ? null : { backgroundColor: `#${hex}` }),
        // Scale the glyph with the box; floor keeps 2 initials legible at 16px.
        fontSize: Math.max(8, Math.round(size * 0.42)),
      }}
    >
      {initials}
    </span>
  )
}
