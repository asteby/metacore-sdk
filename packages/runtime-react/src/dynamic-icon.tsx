// DynamicIcon resolves a lucide glyph by name without pulling the full icon
// set into the shared chunk. It draws through the shared glyph registry of
// @asteby/metacore-ui: a glyph seen before renders in the first frame, and an
// unseen one holds its box until it loads, so the label next to it stays put.
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { Glyph } from '@asteby/metacore-ui/icons'

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
    const kebab = pascalToKebab(pascal)
    // Lucide keys split digits ("building-2"); "building2" is not one.
    return (
        dynamicIconImports[kebab as IconName] ??
        dynamicIconImports[kebab.replace(/([a-z])(\d)/g, '$1-$2') as IconName]
    )
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
    const resolved = resolveLucideIconName(name)
    if (!resolved) return null
    return <Glyph name={resolved} className={className} />
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
