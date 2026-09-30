// ActionBar — barra de acciones de un documento (benchmark §5.4 / §6.2):
// una primaria (verbo + sustantivo), 2–3 secundarias visibles, el resto en
// «Más…» y las destructivas separadas (divisor) y en rojo. Una acción bloqueada se ve
// deshabilitada con su motivo (no desaparece: el operador entiende por qué).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MoreHorizontal } from 'lucide-react'
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from '../dynamic-icon'
import type { ResolvedAction, ResolvedActionLayout } from './types'

export interface ActionBarProps {
    layout: ResolvedActionLayout
    /**
     * Ejecuta la acción. Si devuelve una promesa, el botón muestra `loading`
     * hasta que se resuelve (acciones asíncronas, §6.2).
     */
    onAction: (action: ResolvedAction) => void | Promise<unknown>
    className?: string
}

export function ActionBar({ layout, onAction, className }: ActionBarProps) {
    const { t } = useTranslation()
    const [busy, setBusy] = useState<string | null>(null)

    const run = async (a: ResolvedAction) => {
        if (a.blockedReason || busy) return
        setBusy(a.def.key)
        try {
            await onAction(a)
        } finally {
            setBusy(null)
        }
    }

    const label = (a: ResolvedAction) => t(a.def.label, { defaultValue: a.def.label })
    const { primary, secondary, more, destructive } = layout
    const hasMenu = more.length > 0

    const button = (a: ResolvedAction, variant: 'default' | 'outline' | 'destructive') => {
        const loading = busy === a.def.key
        const btn = (
            <Button
                key={a.def.key}
                type='button'
                size='sm'
                variant={variant === 'destructive' ? 'outline' : variant}
                disabled={!!a.blockedReason || (!!busy && !loading)}
                aria-disabled={!!a.blockedReason}
                data-action={a.def.key}
                onClick={() => run(a)}
                className={cn(
                    variant === 'destructive' &&
                        'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive',
                )}
            >
                {loading ? (
                    <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
                ) : a.def.icon ? (
                    <span className='mr-1.5 inline-flex h-4 w-4 items-center'>
                        <DynamicIcon name={a.def.icon} className='h-4 w-4' />
                    </span>
                ) : null}
                {label(a)}
            </Button>
        )
        if (!a.blockedReason) return btn
        return (
            <Tooltip key={a.def.key}>
                <TooltipTrigger asChild>
                    {/* span: un botón disabled no dispara el tooltip */}
                    <span tabIndex={0}>{btn}</span>
                </TooltipTrigger>
                <TooltipContent className='max-w-xs'>{t(a.blockedReason, { defaultValue: a.blockedReason })}</TooltipContent>
            </Tooltip>
        )
    }

    const item = (a: ResolvedAction) => (
        <DropdownMenuItem
            key={a.def.key}
            disabled={!!a.blockedReason}
            data-action={a.def.key}
            onSelect={() => run(a)}
        >
            {a.def.icon ? (
                <span className='mr-2 inline-flex h-4 w-4 items-center'>
                    <DynamicIcon name={a.def.icon} className='h-4 w-4' />
                </span>
            ) : null}
            <span className='flex flex-col'>
                {label(a)}
                {a.blockedReason ? (
                    <span className='text-xs font-normal text-muted-foreground'>
                        {t(a.blockedReason, { defaultValue: a.blockedReason })}
                    </span>
                ) : null}
            </span>
        </DropdownMenuItem>
    )

    return (
        <TooltipProvider delayDuration={150}>
            <div className={cn('flex flex-wrap items-center gap-2', className)} data-document-actions=''>
                {primary ? button(primary, primary.def.destructive ? 'destructive' : 'default') : null}
                {secondary.map((a) => button(a, 'outline'))}
                {hasMenu ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type='button' size='sm' variant='outline' aria-label={t('document.more', { defaultValue: 'Más…' })}>
                                <MoreHorizontal className='mr-1.5 h-4 w-4' />
                                {t('document.more', { defaultValue: 'Más…' })}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='min-w-56'>
                            {more.map((a) => item(a))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
                {destructive.length > 0 ? (
                    <>
                        <span aria-hidden className='mx-1 h-6 w-px bg-border' />
                        {destructive.map((a) => button(a, 'destructive'))}
                    </>
                ) : null}
            </div>
        </TooltipProvider>
    )
}
