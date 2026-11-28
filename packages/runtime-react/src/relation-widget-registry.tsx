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
// Alcance: crear Y editar (`create_inline`). Al editar, el modal lee las filas ya guardadas de la
// relación (COMPLETAS: si no logra leerlas todas, la relación no se envía y no se borra nada) y las
// entrega en `rows`, cada una con su `id`. Al guardar envía `_children[relación]` SOLO si el usuario
// cambió las filas: las que tienen `id` se actualizan, las nuevas se crean y las que el widget quita
// del arreglo se BORRAN en el servidor. Un widget que reemplaza filas debe conservar `row.id`
// (`{ ...row, values }`). Las relaciones sin widget siguen en su panel (`DynamicRelations`).
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
    /** Catalog scope selected by the operator. undefined means use the legacy branch market. */
    catalogMarket?: string | null
}

export interface RelationWidgetProps {
    /** La relación servida (name, through, foreign_key, label, widget, addon, min…). */
    relation: RelationMeta
    /** Campos capturables del modelo hijo (sin la FK al padre ni los gestionados por el servidor). */
    fields: InlineFieldMeta[]
    /** Filas actuales. Al editar, las ya guardadas traen `id` (consérvalo al reemplazarlas). */
    rows: DraftRow[]
    /** Reemplaza las filas (el modal las envía en `_children[relation.name]`). */
    onChange: (rows: DraftRow[]) => void
    /** Valores VIVOS del formulario del padre (se actualizan al teclear). */
    values: Record<string, any>
    /**
     * Fusiona campos del PADRE en el formulario (como `FieldWidgetProps.setValues`). Para widgets que
     * derivan un campo del padre de sus filas (p. ej. el precio base desde el precio de un mercado). Solo
     * se aplican claves de campos capturables del modal (las de solo lectura se ignoran: un widget no salta
     * un candado). Ausente donde el host no puede escribir el padre.
     */
    setValues?: (patch: Record<string, any>) => void
    /** El formulario no permite editar ahora (guardando, o al editar mientras se leen las filas guardadas). */
    readOnly?: boolean
    /**
     * `create` al crear el padre; `edit` al editarlo (las filas existentes traen `id`); `view` al verlo (solo lectura).
     * `view` solo llega a un widget que lo declara con `supportsView = true` (ver `relationWidgetSupportsView`): sin la
     * marca el modal de detalle sigue con el panel genérico de relaciones, como siempre. En `view` el host NO carga
     * filas (`rows` llega vacío): el widget lee lo suyo con `recordId`.
     */
    mode?: 'create' | 'edit' | 'view'
    /** Id del registro padre al ver o editar (undefined al crear). El widget en modo `view` lo usa para leer sus datos. */
    recordId?: string | number
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

/**
 * ¿El widget sabe pintarse en «Ver» (`mode: 'view'`, solo lectura)? Lo declara con una propiedad estática
 * `supportsView = true` en su componente. Opt-in a propósito: un widget hecho solo para capturar (crear/editar) no debe
 * recibir `view` ni salir del panel genérico de relaciones donde hoy se ve el detalle.
 */
export function relationWidgetSupportsView(component: unknown): boolean {
    return !!component && (component as { supportsView?: unknown }).supportsView === true
}

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
