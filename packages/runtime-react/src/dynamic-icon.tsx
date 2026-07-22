// Minimal DynamicIcon — resolves a lucide-react icon by name. Used across
// action modals and the default row-action menus. Hosts that need custom
// icon sets can override by shadowing this component via their own prop.
import * as icons from 'lucide-react'

export interface DynamicIconProps {
    name: string
    className?: string
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
    const resolved = resolveLucideIconName(name) ?? name
    const Icon = (icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[resolved]
    if (!Icon) return null
    return <Icon className={className} />
}

// resolveLucideIconName — canonical PascalCase lucide name for a value that is
// either already PascalCase ("CreditCard") or the kebab slug lucide documents
// ("credit-card"). Returns null for anything that is not a real glyph: empty,
// path-like strings (slash, dot, scheme), or the generic "Icon" base export.
export function resolveLucideIconName(value: unknown): string | null {
    if (typeof value !== 'string' || value === '' || value === 'Icon') return null
    if (/[/\\.:\s]/.test(value)) return null
    let name = value
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
        name = value
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('')
    }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return null
    return (icons as unknown as Record<string, unknown>)[name] ? name : null
}

// isLucideIconName — true when a string is a lucide-react icon name
// ("Banknote", "CreditCard", or the kebab slug "credit-card"). Lets image-ish
// renderers tell an icon name apart from an image path/URL: addons declare
// icons by lucide slug (same convention as OptionDef.icon), so a column
// inferred as `image` may carry one. Path-like strings (slash, dot, scheme)
// are rejected before the registry lookup; "Icon" itself is the generic base
// component, not a real glyph.
export function isLucideIconName(value: unknown): value is string {
    return resolveLucideIconName(value) !== null
}
