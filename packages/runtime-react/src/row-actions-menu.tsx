// RowActionsMenu — el «…» de una fila: la acción primaria (si hay) arriba y
// destacada, las principales debajo y las secundarias (compartir, imprimir,
// correo, chat, PDF/XML y lo que aporten addons vía registerRecordAction)
// agrupadas en un «Más…» discreto. Una acción por capacidad sin proveedor
// activo, o una contribución cuyo addon no está instalado, no aparece.
//
// DynamicTable lo usa por defecto (getDynamicColumns) y los hosts que arman su
// propia columna de acciones lo reutilizan en vez de duplicar el menú.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
// Root entry on purpose (not '/primitives'): see dropdown-menu-entry.test.ts.
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@asteby/metacore-ui'
import { DynamicIcon } from './dynamic-icon'
import { translateMetadataLabel } from './dynamic-columns-helpers'
import { RequiresAddonLock, resolveRequiresAddon, useRequiresAddonLabel } from './requires-addon'
import { useInstalledAddons } from './installed-addons-context'
import { isActionProviderActive, splitActionsByPriority, useRecordActions, type ResolvedRecordAction } from './record-actions'

/**
 * One entry of the row "…" menu. An action gated by a missing optional addon
 * (`requiresAddon`) stays listed with a lock + tooltip; the click still goes to
 * `onAction`, whose shared handler (useDynamicRowActions) opens the
 * requires-addon dialog instead of executing.
 */
export function RowActionMenuItem({
    action,
    label,
    onSelect,
    className,
}: {
    action: any
    label: React.ReactNode
    onSelect: (e: React.MouseEvent) => void
    className?: string
}) {
    const requirement = resolveRequiresAddon(action)
    const requiresAddonLabel = useRequiresAddonLabel()
    return (
        <DropdownMenuItem
            onClick={onSelect}
            title={requirement ? requiresAddonLabel(requirement) : undefined}
            data-requires-addon={requirement?.key}
            data-action={action.key}
            className={className}
        >
            <DynamicIcon name={action.icon || 'Zap'} className="mr-2 h-4 w-4" />
            {label}
            {requirement && <RequiresAddonLock requirement={requirement} />}
        </DropdownMenuItem>
    )
}

export interface RowActionsMenuProps {
    /** Acciones de metadata ya filtradas por estado/condición de la fila. */
    actions: any[]
    row: Record<string, any>
    /** Modelo de la fila: resuelve las acciones aportadas por addons. */
    model?: string
    onAction?: (actionKey: string, row: any) => void
    /** Sustituye el ícono del disparador (p. ej. un spinner mientras imprime). */
    triggerIcon?: React.ReactNode
    disabled?: boolean
}

/**
 * Modelo de las filas que pinta la tabla. DynamicTable lo provee: la factoría
 * de columnas (getDynamicColumns) no recibe el modelo y el menú lo necesita
 * para resolver las acciones aportadas por addons.
 */
export const RowActionsModelContext = React.createContext<string | undefined>(undefined)

type MenuEntry =
    | { kind: 'action'; action: any }
    | { kind: 'contribution'; item: ResolvedRecordAction }

export function RowActionsMenu({ actions, row, model, onAction, triggerIcon, disabled }: RowActionsMenuProps) {
    const { t } = useTranslation()
    const installed = useInstalledAddons()
    const ctxModel = React.useContext(RowActionsModelContext)
    const recordModel = model ?? ctxModel
    const contributed = useRecordActions(recordModel ?? '', recordModel ? row : null).filter((c) => !!c.run)

    const available = actions.filter((a) => isActionProviderActive(a, installed))
    const { primary, main, secondary } = splitActionsByPriority(available)
    const mainEntries: MenuEntry[] = main.map((action) => ({ kind: 'action', action }))
    const secondaryEntries: MenuEntry[] = secondary.map((action) => ({ kind: 'action', action }))
    for (const item of contributed) {
        ;(item.priority === 'primary' ? mainEntries : secondaryEntries).push({ kind: 'contribution', item })
    }

    if (!primary && mainEntries.length === 0 && secondaryEntries.length === 0) return null

    const renderEntry = (e: MenuEntry) =>
        e.kind === 'action' ? (
            <RowActionMenuItem
                key={e.action.key}
                action={e.action}
                label={translateMetadataLabel(e.action.label, t)}
                onSelect={() => onAction?.(e.action.key, row)}
            />
        ) : (
            <DropdownMenuItem key={e.item.key} data-action={e.item.key} onClick={() => void e.item.run?.()}>
                <DynamicIcon name={e.item.icon || 'Share2'} className="mr-2 h-4 w-4" />
                {t(e.item.label, { defaultValue: e.item.label })}
            </DropdownMenuItem>
        )

    const hasMain = !!primary || mainEntries.length > 0
    const moreLabel = t('datatable.more_actions', { defaultValue: 'Más…' })

    return (
        <div className="flex items-center justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0" disabled={disabled} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <span className="sr-only">{t('datatable.open_menu', { defaultValue: 'Abrir menú' })}</span>
                        {triggerIcon ?? <MoreHorizontal className="h-4 w-4" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {primary ? (
                        <RowActionMenuItem
                            action={primary}
                            label={translateMetadataLabel(primary.label, t)}
                            onSelect={() => onAction?.(primary.key, row)}
                            className="font-semibold"
                        />
                    ) : null}
                    {mainEntries.map(renderEntry)}
                    {secondaryEntries.length > 0 && hasMain ? (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger data-row-more="" className="text-muted-foreground">
                                    {moreLabel}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent data-row-secondary="">{secondaryEntries.map(renderEntry)}</DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </>
                    ) : (
                        // Sin principales no hay con qué competir: lista plana.
                        secondaryEntries.map(renderEntry)
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
