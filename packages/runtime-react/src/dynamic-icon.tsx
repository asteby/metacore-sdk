// Minimal DynamicIcon — resolves a lucide-react icon by name. Used across
// action modals and the default row-action menus. Hosts that need custom
// icon sets can override by shadowing this component via their own prop.
import * as icons from 'lucide-react'

export interface DynamicIconProps {
    name: string
    className?: string
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
    const Icon = (icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
    if (!Icon) return null
    return <Icon className={className} />
}

// isLucideIconName — true when a string is a lucide-react icon name
// ("Banknote", "CreditCard"). Lets image-ish renderers tell an icon name apart
// from an image path/URL: addons declare icons by lucide slug (same convention
// as OptionDef.icon), so a column inferred as `image` may carry one. Path-like
// strings (slash, dot, scheme) are rejected before the registry lookup; "Icon"
// itself is the generic base component, not a real glyph.
export function isLucideIconName(value: unknown): value is string {
    if (typeof value !== 'string' || value === '' || value === 'Icon') return false
    if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) return false
    return Boolean((icons as unknown as Record<string, unknown>)[value])
}
