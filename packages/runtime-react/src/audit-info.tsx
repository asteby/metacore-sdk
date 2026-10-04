/**
 * audit-info.tsx
 *
 * <AuditInfo> — discreet "when and who" footer for a record: created, modified
 * and (if tombstoned) deleted, each with the actor and a relative + absolute
 * date. Driven only by the kernel's `TableMetadata.audit` (column names) and
 * the record row — manifests declare nothing.
 *
 * Actor resolution (no extra requests), in order:
 *   1. the host's `resolveActor(id)` when it returns a name;
 *   2. the record's expanded sibling (`created_by_id` → `row.created_by`,
 *      `{ label | name | title }` or a plain string);
 *   3. the system actor id → "Sistema" / "System";
 *   4. a short id (first 8 chars) — never a long uuid.
 *
 * Renders nothing when `audit` is absent or the record has none of its values.
 */
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import { formatDateCell } from './dynamic-columns'
import { objectLabel } from './dynamic-relation-helpers'
import { isNilUuid } from './nil-uuid'
import { useTimeZone } from './org-runtime-context'
import type { AuditMeta } from './types'

/** The kernel's actor for unattended work (schedules, webhooks, connectors). */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000001'

const AUDIT_KEYS: (keyof AuditMeta)[] = [
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'deleted_at',
    'deleted_by',
]

/**
 * Defensive reader for the served `audit` block: keeps only known keys whose
 * value is a non-empty string; returns `undefined` when nothing usable remains.
 */
export function readAuditMeta(raw: unknown): AuditMeta | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const src = raw as Record<string, unknown>
    const out: AuditMeta = {}
    for (const k of AUDIT_KEYS) {
        const v = src[k]
        if (typeof v === 'string' && v.trim() !== '') out[k] = v
    }
    return Object.keys(out).length ? out : undefined
}

export interface AuditActor {
    /** Display text. */
    name: string
    /** True when the name is a real resolved label (not a short id). */
    resolved: boolean
}

/** Resolves the actor stored in `row[idColumn]` to something human. */
export function resolveAuditActor(
    row: Record<string, unknown>,
    idColumn: string | undefined,
    opts: { resolveActor?: (id: string) => string | undefined; systemLabel: string },
): AuditActor | null {
    if (!idColumn) return null
    const raw = row[idColumn]
    // The column itself may already be an expanded object.
    const own = objectLabel(raw)
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (!own && (!id || isNilUuid(id))) return null
    if (id.toLowerCase() === SYSTEM_ACTOR_ID) return { name: opts.systemLabel, resolved: true }
    if (id) {
        const fromHost = opts.resolveActor?.(id)
        if (fromHost) return { name: fromHost, resolved: true }
    }
    if (own) return { name: own, resolved: true }
    const base = idColumn.endsWith('_id') ? idColumn.slice(0, -3) : idColumn
    const sibling = base === idColumn ? undefined : row[base]
    const siblingName =
        objectLabel(sibling) ?? (typeof sibling === 'string' && sibling.trim() !== '' ? sibling : undefined)
    if (siblingName) return { name: siblingName, resolved: true }
    return { name: id.length > 8 ? id.slice(0, 8) : id, resolved: false }
}

const COPY = {
    es: {
        title: 'Historial del registro',
        created: 'Creado por {{who}}',
        updated: 'Modificado por {{who}}',
        deleted: 'Eliminado por {{who}}',
        createdAt: 'Creado',
        updatedAt: 'Modificado',
        deletedAt: 'Eliminado',
        system: 'Sistema',
    },
    en: {
        title: 'Record history',
        created: 'Created by {{who}}',
        updated: 'Modified by {{who}}',
        deleted: 'Deleted by {{who}}',
        createdAt: 'Created',
        updatedAt: 'Modified',
        deletedAt: 'Deleted',
        system: 'System',
    },
} as const

export interface AuditInfoProps {
    /** The record row (keys are the column names `audit` points at). */
    record: Record<string, unknown> | null | undefined
    /** `TableMetadata.audit`. Absent → renders nothing. */
    audit: AuditMeta | null | undefined
    /** Optional host resolver uuid → display name (e.g. from a users cache). */
    resolveActor?: (id: string) => string | undefined
    /** IANA timezone; defaults to the org runtime timezone. */
    timeZone?: string
    /** BCP-47 locale; defaults to the i18n language. */
    locale?: string
    /** Start expanded. Default: collapsed. */
    defaultOpen?: boolean
    className?: string
}

interface Line {
    key: string
    text: string
    absolute: string
    title?: string
    relative: string
}

export function AuditInfo({
    record,
    audit,
    resolveActor,
    timeZone,
    locale,
    defaultOpen = false,
    className,
}: AuditInfoProps) {
    const { t, i18n } = useTranslation()
    const ctxTz = useTimeZone()
    const [open, setOpen] = React.useState(defaultOpen)

    const meta = readAuditMeta(audit)
    if (!meta || !record) return null

    const lang = (locale || i18n?.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
    const copy = COPY[lang]
    const dfLocale = lang === 'en' ? enUS : es
    const tz = timeZone ?? ctxTz
    const tt = (key: keyof typeof copy, vars?: Record<string, string>) =>
        t(`audit.${key}`, { defaultValue: copy[key], ...vars }) as string

    const build = (
        key: string,
        atCol: string | undefined,
        byCol: string | undefined,
        whoKey: 'created' | 'updated' | 'deleted',
        whenKey: 'createdAt' | 'updatedAt' | 'deletedAt',
    ): Line | null => {
        const f = atCol ? formatDateCell(record[atCol], undefined, dfLocale, tz) : null
        if (!f) return null
        const actor = resolveAuditActor(record, byCol, { resolveActor, systemLabel: tt('system') })
        const date = new Date(record[atCol as string] as string)
        const relative = formatDistanceToNow(date, { addSuffix: true, locale: dfLocale })
        return {
            key,
            text: actor ? tt(whoKey, { who: actor.name }) : tt(whenKey),
            absolute: f.display,
            title: f.title,
            relative,
        }
    }

    const lines = [
        build('created', meta.created_at, meta.created_by, 'created', 'createdAt'),
        // Hide "modified" when it is the creation instant itself (never edited).
        meta.updated_at && record[meta.updated_at] !== record[meta.created_at ?? '']
            ? build('updated', meta.updated_at, meta.updated_by, 'updated', 'updatedAt')
            : null,
        build('deleted', meta.deleted_at, meta.deleted_by, 'deleted', 'deletedAt'),
    ].filter((l): l is Line => l !== null)

    if (lines.length === 0) return null

    const Chevron = open ? ChevronDown : ChevronRight
    return (
        <div className={cn('text-xs text-muted-foreground', className)} data-testid="audit-info">
            <button
                type="button"
                className="flex items-center gap-1.5 hover:text-foreground"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
            >
                <Chevron className="h-3.5 w-3.5" />
                <History className="h-3.5 w-3.5" />
                <span>{tt('title')}</span>
            </button>
            {open && (
                <ul className="mt-2 space-y-1 pl-6">
                    {lines.map(l => (
                        <li key={l.key} data-audit-line={l.key}>
                            <span>{l.text}</span>
                            {' · '}
                            <time title={l.title}>{l.absolute}</time>
                            <span className="opacity-70"> ({l.relative})</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
