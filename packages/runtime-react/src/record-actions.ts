// Acciones primarias / secundarias de un registro.
//
// Una pantalla de registro tiene UNA acción destacada (la primaria) y el resto
// en su lugar: lo de compartir, imprimir, correo, chat, descargar PDF/XML es
// secundario — va al pie del documento (DocumentSecondaryBar) y al «Más…» del
// menú de fila, nunca compitiendo con la primaria.
//
// Dos fuentes, una misma clasificación:
//   - acciones del modelo (metadata `actions[]`): manifest v3 `priority`, o la
//     convención por clave si no la declara;
//   - acciones aportadas por addons o por el host (registerRecordAction del
//     store canónico de @asteby/metacore-sdk), filtradas por su proveedor
//     instalado y activo (InstalledAddonsProvider).
import { useMemo, useSyncExternalStore } from 'react'
import {
    listRecordActions,
    subscribeActionComponents,
    type ActionPriority,
    type OwnedRecordAction,
    type RecordActionContext,
    type RecordActionContribution,
} from '@asteby/metacore-sdk'
import { useInstalledAddons, type InstalledAddonsValue } from './installed-addons-context'

export * from './action-priority'
export type { RecordActionContext, RecordActionContribution }

export interface ResolvedRecordAction {
    /** Id de la contribución (o `<id>:<item>` si viene de `expand`). */
    key: string
    label: string
    icon?: string
    priority: ActionPriority
    owner?: string
    run?: () => unknown
    render?: RecordActionContribution['render']
}

function modelMatches(models: RecordActionContribution['models'], model: string): boolean {
    if (!models || models === '*') return true
    const m = model.toLowerCase()
    return models.some((x) => {
        const k = x.toLowerCase()
        return k === m || k.endsWith(`.${m}`) || m.endsWith(`.${k}`)
    })
}

/** ¿El proveedor de la contribución está instalado y activo? Sin provider: sí. */
export function isRecordActionProviderActive(row: OwnedRecordAction, installed: InstalledAddonsValue | null): boolean {
    if (!installed) return true
    const req = row.contribution.requires
    if (req?.addon && !installed.addons.has(req.addon)) return false
    if (req?.capability && !installed.capabilities.has(req.capability)) return false
    if (!req?.addon && !req?.capability && row.owner && !installed.addons.has(row.owner)) return false
    return true
}

/** Contribuciones aplicables al registro, filtradas por proveedor y ordenadas. Pura. */
export function resolveRecordActions(
    rows: readonly OwnedRecordAction[],
    ctx: RecordActionContext,
    installed: InstalledAddonsValue | null,
): ResolvedRecordAction[] {
    const out: ResolvedRecordAction[] = []
    const sorted = [...rows].sort(
        (a, b) => (a.contribution.order ?? 0) - (b.contribution.order ?? 0) || a.contribution.id.localeCompare(b.contribution.id),
    )
    for (const row of sorted) {
        const c = row.contribution
        if (!modelMatches(c.models, ctx.model)) continue
        if (!isRecordActionProviderActive(row, installed)) continue
        if (c.when && !c.when(ctx)) continue
        const priority = c.priority ?? 'secondary'
        if (c.expand) {
            for (const item of c.expand(ctx)) {
                out.push({ key: `${c.id}:${item.key}`, label: item.label, icon: item.icon ?? c.icon, priority, owner: row.owner, run: item.run })
            }
            continue
        }
        out.push({
            key: c.id,
            label: c.label ?? c.id,
            icon: c.icon,
            priority,
            owner: row.owner,
            run: c.run ? () => c.run!(ctx) : undefined,
            render: c.render,
        })
    }
    return out
}

/** Acciones aportadas al registro (`model`, `record`), reactivas a register/unbind. */
export function useRecordActions(model: string, record: Record<string, unknown> | null | undefined): ResolvedRecordAction[] {
    const rows = useSyncExternalStore(subscribeActionComponents, listRecordActions, listRecordActions)
    const installed = useInstalledAddons()
    return useMemo(
        () => (record ? resolveRecordActions(rows, { model, record }, installed) : []),
        [rows, model, record, installed],
    )
}
