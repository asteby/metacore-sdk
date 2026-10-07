// Option visuals shared by every RecordPicker configuration: a thumbnail
// (image / lucide icon name / initials fallback) and the leading visual of an
// option (image, else icon, else color dot, else initials).
import { useState } from 'react'
import { InitialsAvatar } from '@asteby/metacore-ui/primitives'
import { resolveColorCss } from '@asteby/metacore-ui/lib'
import { DynamicIcon, isLucideIconName } from './dynamic-icon'
import type { ResolvedOption } from './use-options-resolver'

/**
 * Small square thumbnail for an option's `image`. When the option has no image
 * it falls back to a deterministic initials avatar (shared `InitialsAvatar`)
 * derived from `name`, so an imageless reference reads as a colored badge rather
 * than an empty placeholder — and rows/triggers stay aligned. `size` is in
 * pixels (kept small — 20–24px — so the picker reads as a list, not a gallery).
 * Inline style for the box dimensions: arbitrary Tailwind classes from a
 * federated addon don't always survive the host's class scan.
 */
export function OptionThumb({
    image,
    name,
    size = 20,
}: {
    image?: string | null
    name?: string | null
    size?: number
}) {
    const [broken, setBroken] = useState(false)
    const box = { width: size, height: size }
    // Missing or 404 image (bare avatar filenames often 404) → initials, never
    // an invisible box that looks like "no avatar".
    if (!image || broken) {
        return <InitialsAvatar name={name} size={size} rounded="sm" tone="neutral" />
    }
    // A lucide icon name stored where an image url/path is expected (the `icon`
    // form widget's icon mode) → render the glyph instead of a broken <img>.
    if (isLucideIconName(image)) {
        return (
            <span className="flex shrink-0 items-center justify-center rounded-sm bg-muted" style={box} aria-hidden>
                <DynamicIcon name={image} className="size-4" />
            </span>
        )
    }
    return (
        <img
            src={image}
            alt=""
            aria-hidden
            loading="lazy"
            className="shrink-0 rounded-sm object-cover"
            style={box}
            onError={() => setBroken(true)}
        />
    )
}

/**
 * Leading visual for an option: a photo thumbnail (FK relations with an image),
 * else a declared icon, else a color dot (enum/status options with a color).
 * Returns null when the option carries none, so plain text options stay plain.
 */
export function OptionLead({
    option,
    size = 20,
}: {
    option?: Pick<ResolvedOption, 'image' | 'color' | 'icon' | 'label'> | null
    size?: number
}) {
    if (!option) return null
    if (option.image) return <OptionThumb image={option.image} name={option.label} size={size} />
    if (option.icon) {
        return (
            <span
                className="flex shrink-0 items-center justify-center"
                style={{ width: size, height: size, color: option.color ? resolveColorCss(option.color) : undefined }}
                aria-hidden
            >
                <DynamicIcon name={option.icon} className="size-4" />
            </span>
        )
    }
    if (option.color) {
        return (
            <span
                className="shrink-0 rounded-full"
                style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5), background: resolveColorCss(option.color) }}
                aria-hidden
            />
        )
    }
    // No image/icon/color: an imageless reference option. Show its initials
    // (shared InitialsAvatar) so it stays visually aligned with the sibling
    // options that DO carry a thumbnail, rather than a blank gap.
    if (option.label) return <InitialsAvatar name={option.label} size={size} rounded="sm" tone="neutral" />
    return null
}
