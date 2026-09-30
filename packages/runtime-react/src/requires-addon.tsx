// requiresAddon — an action that depends on an OPTIONAL addon the org has not
// installed yet (e.g. link_inbox "Conectar WhatsApp" needs connector_whatsapp).
//
// The manifest declares `compatibility.requires[].enables: ["action:<Model>.<key>"]`
// and the host stamps each affected action's metadata, only while the required
// addon is missing:
//
//   "requires_addon": { "key": "connector_whatsapp", "name": "Conector WhatsApp", "reason": "…" }
//
// The action is NOT hidden (the user should discover the feature) and NOT
// executed: row menus / kanban cards / the model toolbar render it with a lock
// and a tooltip, and a click opens <RequiresAddonDialog> instead of the action
// dispatcher. "Instalar" delegates to the host (setAddonInstallHandler) or, when
// none is registered, navigates to `/marketplace/<key>` through the SDK router so
// the host basepath (ops lives under /app) is respected.
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@asteby/metacore-ui/primitives'
import type { RequiresAddon } from './types'

export type { RequiresAddon }

/**
 * Reads the addon requirement off an action, tolerating both the camelCase
 * `requiresAddon` and the snake_case `requires_addon` the host serves. Returns
 * null when the action is freely executable (no requirement, or a malformed one
 * without a `key` — degrade to "runs", never to "locked forever").
 */
export function resolveRequiresAddon(action: any): RequiresAddon | null {
    const raw = action?.requiresAddon ?? action?.requires_addon
    if (!raw || typeof raw !== 'object') return null
    const key = typeof raw.key === 'string' ? raw.key.trim() : ''
    if (!key) return null
    const out: RequiresAddon = { key }
    if (typeof raw.name === 'string' && raw.name) out.name = raw.name
    if (typeof raw.reason === 'string' && raw.reason) out.reason = raw.reason
    return out
}

type AddonInstallHandler = (key: string) => void

let installHandler: AddonInstallHandler | null = null

/**
 * Registers the host's "install this addon" flow (e.g. open the marketplace
 * install drawer). Pass `null` to unregister. Without a handler the SDK
 * navigates to `/marketplace/<key>` via the router.
 */
export function setAddonInstallHandler(fn: AddonInstallHandler | null): void {
    installHandler = fn
}

/** Current host install handler, or null when none is registered. */
export function getAddonInstallHandler(): AddonInstallHandler | null {
    return installHandler
}

/** Display name for a requirement: the host-provided name, else the key. */
export function requiresAddonName(req: RequiresAddon): string {
    return req.name || req.key
}

/** Tooltip text for a gated action: "Requiere «<name>»". */
export function useRequiresAddonLabel(): (req: RequiresAddon) => string {
    const { t } = useTranslation()
    return (req) =>
        t('dynamic.requires_addon_badge', {
            defaultValue: 'Requiere «{{name}}»',
            name: requiresAddonName(req),
        })
}

/** Lock marker rendered next to a gated action's label (hover = addon name). */
export function RequiresAddonLock({ requirement }: { requirement: RequiresAddon }) {
    const label = useRequiresAddonLabel()(requirement)
    return (
        <span
            className="ml-auto inline-flex shrink-0 items-center pl-2 text-muted-foreground"
            title={label}
            aria-label={label}
            data-requires-addon={requirement.key}
        >
            <Lock className="h-3.5 w-3.5" />
        </span>
    )
}

export interface RequiresAddonDialogProps {
    /** The requirement to explain; the dialog renders nothing while null. */
    requirement: RequiresAddon | null
    onOpenChange: (open: boolean) => void
}

/**
 * Compact "this action requires <addon>" dialog. Never touches the backend:
 * "Instalar" hands the key to the host handler or routes to the marketplace.
 */
export function RequiresAddonDialog({ requirement, onOpenChange }: RequiresAddonDialogProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    if (!requirement) return null
    const name = requiresAddonName(requirement)

    const install = () => {
        onOpenChange(false)
        const handler = installHandler
        if (handler) handler(requirement.key)
        else navigate({ to: `/marketplace/${encodeURIComponent(requirement.key)}` })
    }

    return (
        <AlertDialog open onOpenChange={onOpenChange}>
            <AlertDialogContent className="sm:max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {t('dynamic.requires_addon_title', {
                            defaultValue: 'Esta acción requiere «{{name}}»',
                            name,
                        })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {requirement.reason
                            ? t(requirement.reason, { defaultValue: requirement.reason })
                            : t('dynamic.requires_addon_description', {
                                  defaultValue: 'Instala «{{name}}» para habilitar esta acción.',
                                  name,
                              })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>
                        {t('dynamic.requires_addon_cancel', { defaultValue: 'Cancelar' })}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e: React.MouseEvent) => {
                            e.preventDefault()
                            install()
                        }}
                    >
                        {t('dynamic.requires_addon_install', {
                            defaultValue: 'Instalar «{{name}}»',
                            name,
                        })}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
