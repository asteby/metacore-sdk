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
