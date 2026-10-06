// DocumentSecondaryBar — pie del documento con las acciones secundarias:
// compartir, imprimir/descargar PDF o XML, enviar por correo, enviar al chat…
// La cabecera se queda con UNA primaria (y sus principales); esto va abajo,
// discreto. Junta dos fuentes:
//   - `items`: acciones del propio documento/modelo ya clasificadas como
//     secundarias (resolveActions → `footer`, o splitActionsByPriority);
//   - las aportadas por addons/host con registerRecordAction, sólo si su
//     proveedor está instalado y activo (useRecordActions).
// Sin nada que mostrar no pinta nada.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from '../dynamic-icon'
import { useRecordActions } from '../record-actions'

export interface SecondaryBarItem {
    key: string
    label: string
    icon?: string
    /** Deshabilitada con su motivo (no desaparece). */
    blockedReason?: string
    run: () => unknown
}

export interface DocumentSecondaryBarProps {
    items?: SecondaryBarItem[]
    /** Modelo + registro: resuelven las acciones aportadas por addons. */
    model?: string
    record?: Record<string, unknown> | null
    /** Controles extra del host (al final). */
    children?: ReactNode
    className?: string
}

export function DocumentSecondaryBar({ items = [], model, record, children, className }: DocumentSecondaryBarProps) {
    const { t } = useTranslation()
    const contributed = useRecordActions(model ?? '', model ? record : null)
    const [busy, setBusy] = useState<string | null>(null)

    const run = async (key: string, fn?: () => unknown) => {
        if (!fn || busy) return
        setBusy(key)
        try {
            await fn()
        } finally {
            setBusy(null)
        }
    }

    const all: SecondaryBarItem[] = [
        ...items,
        ...contributed.filter((c) => c.run).map((c) => ({ key: c.key, label: c.label, icon: c.icon, run: c.run! })),
    ]
    const rendered = contributed.filter((c) => c.render && !c.run)
    if (all.length === 0 && rendered.length === 0 && !children) return null

    return (
        <footer
            className={cn('flex flex-wrap items-center gap-1.5 border-t pt-3', className)}
            data-document-secondary=''
            aria-label={t('datatable.secondary_actions', { defaultValue: 'Compartir y documentos' })}
        >
            {all.map((a) => (
                <Button
                    key={a.key}
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='text-muted-foreground'
                    data-action={a.key}
                    disabled={!!a.blockedReason || (!!busy && busy !== a.key)}
                    title={a.blockedReason ? t(a.blockedReason, { defaultValue: a.blockedReason }) : undefined}
                    onClick={() => void run(a.key, a.run)}
                >
                    {busy === a.key ? (
                        <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
                    ) : a.icon ? (
                        <DynamicIcon name={a.icon} className='mr-1.5 h-4 w-4' />
                    ) : null}
                    {t(a.label, { defaultValue: a.label })}
                </Button>
            ))}
            {rendered.map((c) => {
                const C = c.render!
                return <C key={c.key} model={model!} record={record!} />
            })}
            {children}
        </footer>
    )
}
