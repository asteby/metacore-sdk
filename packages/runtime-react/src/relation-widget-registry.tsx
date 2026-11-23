// Registro de widgets de RELACIÓN. El kernel sirve, en cada relación de la metadata,
// `widget` (nombre) y `addon` (quién lo aporta). Una relación `create_inline`
// se pinta por omisión como la tabla editable de filas (`InlineRelationRows`);
// si declara `widget: "<nombre>"` y ese nombre está registrado, el modal pinta
// el componente del host EN SU LUGAR:
//
//   import { registerRelationWidget } from '@asteby/metacore-runtime-react'
//
//   const dispose = registerRelationWidget('market-prices', MarketPricesWidget)
//
// El widget es dueño de las filas hijas: recibe `rows` y las devuelve por
// `onChange`. Las filas viajan en `_children[relation.name]` igual que las de
// la tabla (misma serialización, mismos errores 422 por fila), y recibe los
// valores VIVOS del formulario del padre (`values`) para calcular en tiempo
// real (p. ej. el costo del producto → margen por mercado). Un nombre sin
// registro cae a la tabla inline de siempre: compatibilidad total.
//
// Alcance: crear (`create_inline`). En editar las relaciones hijas siguen su
// panel (`DynamicRelations`), que guarda cada fila por su cuenta.
import type * as React from 'react'
import type { DraftRow } from './draft-rows'
import type { InlineFieldMeta } from './dialogs/inline-relations'
import type { RelationMeta } from './types'
import { createWidgetRegistry } from './widget-registry'

export interface RelationWidgetContext {
    /** Sucursal activa del selector de sucursal (undefined sin sucursales). */
    branchId?: string | number | null
    /** `branches.market_code` de la sucursal activa; null = sin mercado o aún cargando. */
    market?: string | null
}

export interface RelationWidgetProps {
    /** La relación servida (name, through, foreign_key, label, widget, addon, min…). */
    relation: RelationMeta
    /** Campos capturables del modelo hijo (sin la FK al padre ni los gestionados por el servidor). */
    fields: InlineFieldMeta[]
    /** Filas borrador actuales. */
    rows: DraftRow[]
    /** Reemplaza las filas (el modal las envía en `_children[relation.name]`). */
    onChange: (rows: DraftRow[]) => void
    /** Valores VIVOS del formulario del padre (se actualizan al teclear). */
    values: Record<string, any>
    /** El formulario no permite editar ahora (guardando). */
    readOnly?: boolean
    /** Errores por celda `"<i>.<campo>"` y por fila `"<i>"`, ya localizados. */
    errors?: Record<string, string>
    /** Error de conjunto de la relación (mínimo de filas, 422 `min`). */
    formError?: string
    /** Avisa que una celda cambió, para limpiar su error del servidor. */
    onCellEdited?: (index: number, field: string) => void
    /** Avisa que se quitó una fila: los índices de los errores del servidor ya no valen. */
    onRowRemoved?: () => void
    context: RelationWidgetContext
}

export type RelationWidgetComponent = React.ComponentType<RelationWidgetProps>

const registry = createWidgetRegistry<RelationWidgetComponent>()

/**
 * Registra el componente que pinta las relaciones con `widget: <name>`. Devuelve
 * un disposer; un registro posterior con el mismo nombre reemplaza al anterior.
 */
export const registerRelationWidget = registry.register

/** El componente registrado para `name`, o undefined (nunca lanza). */
export const getRelationWidget = registry.get

/** Nombres registrados, para diagnóstico. */
export const listRelationWidgets = registry.list

export const clearRelationWidgets = registry.clear

/** Re-pinta al llamador cada vez que se (des)registra un widget de relación. */
export const useRelationWidgetRegistryVersion = registry.useVersion
