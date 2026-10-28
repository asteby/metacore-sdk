/**
 * provenance.tsx — who made a record, and how.
 *
 * The kernel's `provenance` package stores, per record and per change, the
 * actor kind (human | agent | system | integration), the person the agent
 * acted for, who authorized an agent proposal and when, the channel (`via`),
 * the origin and the mode (manual | assisted | automated). Hosts attach the
 * creation provenance to list rows at `created_by.provenance` (or
 * `row.provenance`); this module turns it into one of four presentations:
 *
 *   human     — a person on their own: their avatar and name.
 *   agent     — the app's agent (OrgRuntimeProvider `agentActor`, e.g. Asistente)
 *               with the origin; "pending proposal" when it waits for a person.
 *   system    — platform work or an integration: system icon + origin.
 *   assisted  — "Ana with Asistente": the person's avatar with the agent's
 *               superimposed, and an accessible tooltip with who authorized,
 *               what the agent proposed and when.
 *
 * Rows without stored provenance keep the legacy rules: a null/system
 * `created_by_id` is the system (origin from OrgRuntimeProvider
 * `provenanceOrigin`), anything else is the person in `created_by`.
 */
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Plug, Server } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage, Tooltip, TooltipContent, TooltipTrigger } from '@asteby/metacore-ui'
import { cn, getInitials } from '@asteby/metacore-ui/lib'
import { useImageUrl } from './image-url-context'
import { isNilUuid } from './nil-uuid'
import { useAgentActor, useProvenanceOrigin, useSystemActor, useTimeZone } from './org-runtime-context'

/** The kernel's fixed actor for unattended work. */
const KERNEL_SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000001'

export type ProvenanceActorKind = 'human' | 'agent' | 'system' | 'integration'
export type ProvenanceMode = 'manual' | 'assisted' | 'automated'

/** Wire shape of a stored change's provenance (kernel `Entry.Presentation`). */
export interface ProvenanceData {
    actor_kind: ProvenanceActorKind
    mode?: ProvenanceMode
    actor_id?: string
    actor_name?: string
    actor_person_name?: string
    actor_person_avatar?: string
    on_behalf_of?: string
    on_behalf_of_name?: string
    on_behalf_of_avatar?: string
    authorized_by?: string
    authorized_by_name?: string
    authorized_by_avatar?: string
    authorized_at?: string
    via?: string
    origin?: string
    ref_kind?: string
    ref_id?: string
    session_id?: string
    summary?: string
    proposed?: boolean
    /** When the change happened. */
    at?: string
}

/** The four presentations. */
export type AuthorshipKind = 'human' | 'agent' | 'system' | 'assisted'

const KINDS = new Set(['human', 'agent', 'system', 'integration'])

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** Defensive reader: an object or JSON string with a known `actor_kind`. */
export function parseProvenance(raw: unknown): ProvenanceData | undefined {
    let v = raw
    if (typeof v === 'string') {
        try {
            v = JSON.parse(v)
        } catch {
            return undefined
        }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
    const o = v as Record<string, unknown>
    if (typeof o.actor_kind !== 'string' || !KINDS.has(o.actor_kind)) return undefined
    return o as unknown as ProvenanceData
}

/** Reads a row's creation provenance (`created_by.provenance` or `provenance`). */
export function readProvenance(row: Record<string, unknown> | null | undefined): ProvenanceData | undefined {
    if (!row) return undefined
    const cb = row.created_by
    if (cb && typeof cb === 'object') {
        const p = parseProvenance((cb as Record<string, unknown>).provenance)
        if (p) return p
    }
    return parseProvenance(row.provenance)
}

/** Which of the four presentations a provenance gets. */
export function classifyProvenance(p: ProvenanceData): AuthorshipKind {
    if (p.actor_kind === 'human') return 'human'
    if (p.mode === 'assisted' || (p.authorized_by && !p.proposed)) return 'assisted'
    if (p.actor_kind === 'agent') return 'agent'
    return 'system'
}

/** True when the row's creator is the system (null / nil / kernel actor). */
export function isSystemCreated(row: Record<string, unknown> | null | undefined): boolean {
    if (!row) return false
    const cb = row.created_by
    if (cb && typeof cb === 'object') {
        const o = cb as { system?: unknown; name?: unknown; email?: unknown }
        if (o.system === true) return true
        if (str(o.name) || str(o.email)) return false
    }
    if ('created_by_id' in row) {
        const id = row.created_by_id
        if (id === null || id === undefined || id === '') return true
        const s = String(id).trim().toLowerCase()
        return s === '<nil>' || isNilUuid(s) || s === KERNEL_SYSTEM_ACTOR_ID
    }
    return false
}

// ---- copy -------------------------------------------------------------------

const COPY = {
    es: {
        system: 'Sistema',
        agent: 'Asistente',
        user: 'Usuario',
        with: '{{person}} con {{agent}}',
        proposedBy: 'Propuesto por {{agent}}',
        pending: 'Propuesta pendiente',
        authorizedBy: 'Autorizó: {{person}}',
        onBehalfOf: 'En nombre de {{person}}',
        proposal: '{{agent}} propuso: {{summary}}',
        createdBy: 'Creado por {{who}}',
        'via.chat': 'Chat',
        'via.automation': 'Automatización',
        'via.import': 'Importación',
        'via.webhook': 'Webhook',
        'via.seed': 'Datos iniciales',
        'via.migration': 'Migración',
        'via.job': 'Proceso programado',
        'via.event': 'Evento',
        'via.ui': 'Manual',
        'via.api': 'API',
        'mode.manual': 'Manual',
        'mode.assisted': 'Con asistencia',
        'mode.automated': 'Automático',
    },
    en: {
        system: 'System',
        agent: 'Assistant',
        user: 'User',
        with: '{{person}} with {{agent}}',
        proposedBy: 'Proposed by {{agent}}',
        pending: 'Pending proposal',
        authorizedBy: 'Authorized by: {{person}}',
        onBehalfOf: 'On behalf of {{person}}',
        proposal: '{{agent}} proposed: {{summary}}',
        createdBy: 'Created by {{who}}',
        'via.chat': 'Chat',
        'via.automation': 'Automation',
        'via.import': 'Import',
        'via.webhook': 'Webhook',
        'via.seed': 'Initial data',
        'via.migration': 'Migration',
        'via.job': 'Scheduled job',
        'via.event': 'Event',
        'via.ui': 'Manual',
        'via.api': 'API',
        'mode.manual': 'Manual',
        'mode.assisted': 'Assisted',
        'mode.automated': 'Automated',
    },
} as const

export type ProvenanceCopyKey = keyof (typeof COPY)['es']

/** Copy lookup: `provenance.<key>` from the host i18n, else the built-in es/en. */
export function useProvenanceCopy() {
    const { t, i18n } = useTranslation()
    const lang = (i18n?.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
    const copy = COPY[lang]
    const tt = React.useCallback(
        (key: ProvenanceCopyKey, vars?: Record<string, string>) => {
            const fallback = copy[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars?.[k] ?? '')
            const out = t(`provenance.${key}`, { defaultValue: fallback, ...vars }) as string
            // i18n mocks/backends that ignore defaultValue echo the key back.
            return !out || out === `provenance.${key}` ? fallback : out
        },
        [t, copy],
    )
    return { tt, lang }
}

/** Person shown for a provenance (assisted / human), from the row or the data. */
export interface ProvenancePerson {
    name?: string
    avatar?: string
}

export interface ResolvedAuthorship {
    kind: AuthorshipKind
    /** Main line ("Ana Pérez con Asistente", "Asistente", "Sistema", "data-sync"). */
    label: string
    /** Secondary line (origin / channel / pending proposal). */
    subtitle?: string
    /** Full sentence for tooltip and screen readers. */
    description: string
    person?: ProvenancePerson
    agentName: string
    agentAvatar?: string
    systemAvatar?: string
    integration: boolean
    proposed: boolean
}

function formatWhen(iso: string | undefined, lang: string, timeZone?: string): string | undefined {
    if (!iso) return undefined
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return undefined
    try {
        return d.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
            ...(timeZone ? { timeZone } : {}),
        })
    } catch {
        return d.toISOString()
    }
}

/** Pure-ish resolver (hooks for copy and presentation contexts). */
export function useResolvedAuthorship(input: {
    provenance?: ProvenanceData
    person?: ProvenancePerson
    /** Origin for system rows without provenance (legacy). */
    fallbackOrigin?: string
    /** Force the system presentation (legacy null created_by). */
    system?: boolean
}): ResolvedAuthorship | null {
    const { tt, lang } = useProvenanceCopy()
    const agent = useAgentActor()
    const sys = useSystemActor()
    const tz = useTimeZone()
    const { provenance: p, person, fallbackOrigin, system } = input
    const viaLabel = (via?: string) => {
        if (!via) return undefined
        const key = `via.${via}` as ProvenanceCopyKey
        return key in COPY.es ? tt(key) : via
    }
    if (!p) {
        if (!system) return null
        const name = sys?.name || tt('system')
        return {
            kind: 'system', label: name, subtitle: fallbackOrigin,
            description: [tt('createdBy', { who: name }), fallbackOrigin].filter(Boolean).join(' · '),
            agentName: agent?.name || tt('agent'), systemAvatar: sys?.avatarUrl, integration: false, proposed: false,
        }
    }
    const kind = classifyProvenance(p)
    const agentName = agent?.name || str(p.actor_name) || tt('agent')
    const when = formatWhen(p.authorized_at || p.at, lang, tz)
    const origin = str(p.origin)
    if (kind === 'human') {
        const name = str(person?.name) || str(p.actor_person_name) || tt('user')
        return {
            kind, label: name, subtitle: origin,
            description: [tt('createdBy', { who: name }), viaLabel(p.via), when].filter(Boolean).join(' · '),
            person: { name, avatar: person?.avatar || p.actor_person_avatar },
            agentName, integration: false, proposed: false,
        }
    }
    if (kind === 'assisted') {
        const name = str(p.authorized_by_name) || str(person?.name) || str(p.on_behalf_of_name) || tt('user')
        const avatar = p.authorized_by_avatar || person?.avatar || p.on_behalf_of_avatar
        const parts = [tt('authorizedBy', { person: name })]
        parts.push(p.summary ? tt('proposal', { agent: agentName, summary: p.summary }) : tt('proposedBy', { agent: agentName }))
        if (origin) parts.push(origin)
        if (when) parts.push(when)
        return {
            kind, label: tt('with', { person: name, agent: agentName }),
            subtitle: origin || tt('proposedBy', { agent: agentName }),
            description: parts.join(' · '),
            person: { name, avatar }, agentName, agentAvatar: agent?.avatarUrl, integration: false, proposed: false,
        }
    }
    if (kind === 'agent') {
        const proposed = !!p.proposed
        const sub = proposed ? tt('pending') : origin || viaLabel(p.via)
        const parts = [tt('createdBy', { who: agentName })]
        if (proposed) parts.push(tt('pending'))
        if (origin) parts.push(origin)
        else if (p.via) parts.push(viaLabel(p.via) as string)
        if (p.on_behalf_of_name) parts.push(tt('onBehalfOf', { person: p.on_behalf_of_name }))
        if (p.summary) parts.push(p.summary)
        if (when) parts.push(when)
        return {
            kind, label: agentName, subtitle: sub, description: parts.join(' · '),
            agentName, agentAvatar: agent?.avatarUrl, integration: false, proposed,
        }
    }
    const integration = p.actor_kind === 'integration'
    const name = integration ? str(p.actor_name) || tt('system') : sys?.name || tt('system')
    const sub = origin || viaLabel(p.via)
    return {
        kind: 'system', label: name, subtitle: sub,
        description: [tt('createdBy', { who: name }), sub, when].filter(Boolean).join(' · '),
        agentName, systemAvatar: integration ? undefined : sys?.avatarUrl, integration, proposed: false,
    }
}

// ---- visuals ----------------------------------------------------------------

type Size = 'sm' | 'md'
const PX: Record<Size, number> = { sm: 20, md: 32 }

function PersonAvatar({ name, avatar, size }: { name: string; avatar?: string; size: Size }) {
    const getImageUrl = useImageUrl()
    const px = PX[size]
    return (
        <Avatar className="rounded-lg ring-1 ring-border/50" style={{ width: px, height: px }}>
            <AvatarImage src={avatar ? getImageUrl(avatar) : ''} alt="" className="object-cover" />
            <AvatarFallback className="rounded-lg bg-primary/5 text-[10px] font-bold text-primary">
                {getInitials(name)}
            </AvatarFallback>
        </Avatar>
    )
}

function AgentAvatar({ name, url, px, round }: { name: string; url?: string; px: number; round?: boolean }) {
    const radius = round ? 'rounded-full' : 'rounded-lg'
    if (url) {
        return (
            <img
                src={url}
                alt=""
                aria-hidden="true"
                draggable={false}
                className={cn('shrink-0 select-none bg-primary/5 object-contain', radius)}
                style={{ width: px, height: px }}
            />
        )
    }
    return (
        <span
            aria-hidden="true"
            data-agent-initials={getInitials(name)}
            className={cn('flex shrink-0 items-center justify-center bg-primary/10 text-primary', radius)}
            style={{ width: px, height: px }}
        >
            <Bot style={{ width: px * 0.6, height: px * 0.6 }} />
        </span>
    )
}

function SystemAvatar({ url, integration, px }: { url?: string; integration: boolean; px: number }) {
    if (url) {
        return <img src={url} alt="" aria-hidden="true" className="shrink-0 rounded-lg object-contain" style={{ width: px, height: px }} />
    }
    const Icon = integration ? Plug : Server
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border/50"
            style={{ width: px, height: px }}
        >
            <Icon style={{ width: px * 0.55, height: px * 0.55 }} />
        </span>
    )
}

/** Avatar for a resolved authorship (person with the agent superimposed when assisted). */
export function ProvenanceAvatar({ authorship: a, size = 'md' }: { authorship: ResolvedAuthorship; size?: Size }) {
    const px = PX[size]
    if (a.kind === 'agent') return <AgentAvatar name={a.agentName} url={a.agentAvatar} px={px} />
    if (a.kind === 'system') return <SystemAvatar url={a.systemAvatar} integration={a.integration} px={px} />
    const person = <PersonAvatar name={a.person?.name || a.label} avatar={a.person?.avatar} size={size} />
    if (a.kind === 'human') return person
    const mini = Math.max(12, Math.round(px * 0.5))
    return (
        <span className="relative inline-flex shrink-0" style={{ width: px, height: px }} data-provenance-overlay="">
            {person}
            <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-px ring-1 ring-border" style={{ lineHeight: 0 }}>
                <AgentAvatar name={a.agentName} url={a.agentAvatar} px={mini} round />
            </span>
        </span>
    )
}

export interface ProvenanceBadgeProps {
    /** Stored provenance (kernel wire shape). */
    provenance?: ProvenanceData
    /** Person from the row (`created_by` sibling) when the data has no names. */
    person?: ProvenancePerson
    /** Legacy system row without provenance. */
    system?: boolean
    /** Origin for `system` rows without provenance. */
    fallbackOrigin?: string
    /** `cell`: two lines with a 32px avatar (tables). `inline`: one line (detail, history, notifications). */
    variant?: 'cell' | 'inline'
    className?: string
}

/**
 * Who made a record and how — the four presentations (see module doc) with a
 * keyboard-focusable trigger whose tooltip and screen-reader description say
 * who authorized, what the agent proposed and when.
 */
export function ProvenanceBadge({ provenance, person, system, fallbackOrigin, variant = 'cell', className }: ProvenanceBadgeProps) {
    const a = useResolvedAuthorship({ provenance, person, system, fallbackOrigin })
    const descId = React.useId()
    if (!a) return null
    const inline = variant === 'inline'
    const body = inline ? (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
            <ProvenanceAvatar authorship={a} size="sm" />
            <span className="shrink-0 truncate font-medium">{a.label}</span>
            {a.subtitle ? <span className="min-w-0 truncate text-muted-foreground">· {a.subtitle}</span> : null}
        </span>
    ) : (
        <span className="flex min-w-0 items-center gap-3">
            <ProvenanceAvatar authorship={a} size="md" />
            <span className="flex min-w-0 flex-col overflow-hidden">
                <span className="mb-0.5 truncate text-sm font-medium leading-none text-foreground/90">{a.label}</span>
                {a.subtitle ? (
                    <span className={cn('truncate text-[11px] leading-none', a.proposed ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                        {a.subtitle}
                    </span>
                ) : null}
            </span>
        </span>
    )
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    role="group"
                    aria-label={a.label}
                    aria-describedby={descId}
                    data-provenance={a.kind}
                    className={cn(
                        'min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        inline ? 'inline-flex max-w-full text-sm' : 'flex max-w-full',
                        className,
                    )}
                >
                    {body}
                    <span id={descId} className="sr-only">
                        {a.description}
                    </span>
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{a.description}</TooltipContent>
        </Tooltip>
    )
}

function personFromRow(row: Record<string, unknown> | null | undefined): ProvenancePerson | undefined {
    const cb = row?.created_by
    if (cb && typeof cb === 'object') {
        const o = cb as Record<string, unknown>
        const name = str(o.name) || str(o.label) || str(o.email)
        const avatar = str(o.avatar) || str(o.image) || str(o.photo)
        if (name || avatar) return { name, avatar }
    }
    if (typeof cb === 'string' && cb.trim()) return { name: cb }
    return undefined
}

/** True when the row has something AuthorshipCell renders differently from a plain person. */
export function hasSpecialAuthorship(row: Record<string, unknown> | null | undefined): boolean {
    const p = readProvenance(row)
    if (p) return classifyProvenance(p) !== 'human'
    return isSystemCreated(row)
}

export interface AuthorshipCellProps {
    /** The record row (reads `created_by`, `created_by_id`, provenance). */
    row: Record<string, unknown> | null | undefined
    /** Model key, passed to the host origin resolver for legacy system rows. */
    model?: string
    variant?: 'cell' | 'inline'
    className?: string
}

/**
 * "Created by" for any record: the stored provenance when the host attached
 * it, else the legacy rule (system when `created_by_id` is empty or the kernel
 * actor, the `created_by` person otherwise). Renders nothing for a row with no
 * creator information at all.
 */
export function AuthorshipCell({ row, model, variant = 'cell', className }: AuthorshipCellProps) {
    const originFor = useProvenanceOrigin()
    const provenance = readProvenance(row)
    const person = personFromRow(row)
    const system = !provenance && isSystemCreated(row)
    if (!provenance && !system && !person) return null
    if (!provenance && !system) {
        return (
            <ProvenanceBadge
                provenance={{ actor_kind: 'human', mode: 'manual' }}
                person={person}
                variant={variant}
                className={className}
            />
        )
    }
    return (
        <ProvenanceBadge
            provenance={provenance}
            person={person}
            system={system}
            fallbackOrigin={system ? originFor?.(model, row) : undefined}
            variant={variant}
            className={className}
        />
    )
}

/**
 * Avatar + name for an activity/history event that carries provenance (no
 * tooltip trigger: it lives inside the event's toggle button). The full
 * sentence goes to `title` and to screen readers.
 */
export function ProvenanceActorChip({
    provenance,
    person,
    className,
}: {
    provenance: ProvenanceData
    person?: ProvenancePerson
    className?: string
}) {
    const a = useResolvedAuthorship({ provenance, person })
    if (!a) return null
    return (
        <span className={cn('inline-flex min-w-0 items-center gap-2', className)} title={a.description} data-provenance={a.kind}>
            <ProvenanceAvatar authorship={a} size="sm" />
            <span className="truncate text-sm font-semibold text-foreground">{a.label}</span>
            <span className="sr-only">({a.description})</span>
        </span>
    )
}

/** Provenance carried by a notification (metadata.provenance), if any. */
export function notificationProvenance(item: { metadata?: unknown } | null | undefined): ProvenanceData | undefined {
    let meta = item?.metadata
    if (typeof meta === 'string') {
        try {
            meta = JSON.parse(meta)
        } catch {
            return undefined
        }
    }
    if (!meta || typeof meta !== 'object') return undefined
    return parseProvenance((meta as Record<string, unknown>).provenance)
}

/**
 * Avatar for a notification list (`renderAvatar` of the notifications
 * dropdown): the provenance avatar when the notification carries one, else
 * `fallback`.
 */
export function NotificationProvenanceAvatar({
    item,
    fallback = null,
}: {
    item: { metadata?: unknown } | null | undefined
    fallback?: React.ReactNode
}) {
    const p = notificationProvenance(item)
    const a = useResolvedAuthorship({ provenance: p })
    if (!a) return <>{fallback}</>
    return (
        <span title={a.description} aria-label={a.description} role="img" className="inline-flex">
            <ProvenanceAvatar authorship={a} size="md" />
        </span>
    )
}
