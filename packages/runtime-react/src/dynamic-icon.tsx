// DynamicIcon resolves a lucide glyph by name without pulling the full icon
// set into the shared chunk. Each glyph is its own dynamic import.
import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

export interface DynamicIconProps {
    name: string
    className?: string
}

type IconName = keyof typeof dynamicIconImports

function pascalToKebab(pascal: string): string {
    return pascal
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
}

function kebabToPascal(kebab: string): string {
    return kebab
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
        .join('')
}

function loaderFor(pascal: string) {
    const kebab = pascalToKebab(pascal) as IconName
    return dynamicIconImports[kebab]
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
    const resolved = resolveLucideIconName(name)
    const Icon = useMemo(() => {
        if (!resolved) return null
        const loader = loaderFor(resolved)
        if (!loader) return null
        return lazy(loader as () => Promise<{ default: ComponentType<{ className?: string }> }>)
    }, [resolved])
    if (!Icon) return null
    return (
        <Suspense fallback={null}>
            <Icon className={className} />
        </Suspense>
    )
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
        name = kebabToPascal(value)
    }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return null
    return loaderFor(name) ? name : null
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

/** PascalCase names of every lucide glyph, for the icon picker grid. */
export function lucideIconNames(): string[] {
    return Object.keys(dynamicIconImports).map(kebabToPascal)
}
