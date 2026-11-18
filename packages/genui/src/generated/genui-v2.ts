/* eslint-disable */
// GENERADO por packages/genui/scripts/codegen.mjs desde schema/genui-v2.schema.json. No editar a mano: corre `pnpm --filter @asteby/metacore-genui codegen`.
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "label".
 */
export type Label = string | Tref | Ref
/**
 * Ruta de vinculación; raíces cerradas data|state|record|ctx. Ningún segmento puede ser __proto__, constructor ni prototype.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "bindingPath".
 */
export type BindingPath = string
/**
 * Escalar; las cadenas, de hasta 2 000 puntos de código.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "scalar".
 */
export type Scalar = string | number | boolean | null
/**
 * Valor: escalar o vinculación.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "value".
 */
export type Value = Scalar | Ref
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "stateValue".
 */
export type StateValue =
  | Scalar
  | StateList
  | {
      [k: string]: Scalar | StateList
    }
/**
 * @maxItems 50
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "stateList".
 */
export type StateList = Scalar[]
/**
 * Despachado por `type`; ver block_<type>.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block".
 */
export type Block =
  | BlockStack
  | BlockGrid
  | BlockTabs
  | BlockSection
  | BlockText
  | BlockMarkdown
  | BlockAlert
  | BlockEmpty
  | BlockCard
  | BlockList
  | BlockKpi
  | BlockKpiCard
  | BlockStats
  | BlockLinks
  | BlockTimeline
  | BlockTable
  | BlockModelView
  | BlockView
  | BlockChart
  | BlockForm
  | BlockWizard
  | BlockConfirm
  | BlockSettings
  | BlockMedia
  | BlockSlot
  | BlockExt
  | BlockMap
  | BlockMetric
  | BlockDiagram
/**
 * Identificador único dentro del documento.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "id".
 */
export type Id = string
/**
 * Nombre de región de un grid con `areas` (page@1).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "area".
 */
export type Area = string
/**
 * Pista de `grid.columns`/`grid.rows`: auto, Nfr, Npx o minmax(Npx, Nfr|Npx). Sin CSS libre.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "gridTrack".
 */
export type GridTrack = string
/**
 * Fila de la plantilla de `grid.areas`: nombres de región o `.` (celda vacía) separados por un espacio.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "areaRow".
 */
export type AreaRow = string
/**
 * Clave de campo, columna o entrada: segmentos no vacíos [A-Za-z_][A-Za-z0-9_]* separados por punto (sin "a..b" ni "a."); ningún segmento puede ser __proto__, constructor ni prototype.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "key".
 */
export type Key = string
/**
 * Icono de una opción de tabs: conjunto cerrado.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "tabIcon".
 */
export type TabIcon = 'map' | 'cards' | 'table' | 'dashboard' | 'list' | 'calendar' | 'chart'
/**
 * Clave de permiso del manifiesto (<addon>.<recurso>.<acción>).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "permissionKey".
 */
export type PermissionKey = string
/**
 * Bloque custom registrado: <addon>.<nombre>@<mayor>.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "extName".
 */
export type ExtName = string
/**
 * Marco de una sección/vista: card (el host pinta marco y estados) o bare.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "chrome".
 */
export type Chrome = 'card' | 'bare'
/**
 * Referencia a data.<nombre>.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "source".
 */
export type Source = string
/**
 * Texto visible: literal, clave i18n o vinculación.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "text".
 */
export type Text = string | Tref | Ref
/**
 * Vocabulario de tono compartido (Tone).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "tone".
 */
export type Tone = 'default' | 'muted' | 'info' | 'success' | 'warning' | 'danger'
/**
 * @maxItems 6
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "actions".
 */
export type Actions =
  | []
  | [Action]
  | [Action, Action]
  | [Action, Action, Action]
  | [Action, Action, Action, Action]
  | [Action, Action, Action, Action, Action]
  | [Action, Action, Action, Action, Action, Action]
/**
 * Acción declarativa {do, ...}; un esquema por verbo.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action".
 */
export type Action =
  ActionNavigate | ActionInvoke | ActionSubmit | ActionOpen | ActionClose | ActionSet | ActionRefresh | ActionEmit
/**
 * Ruta de la app (nunca http).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "appPath".
 */
export type AppPath = string
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_submit".
 */
export type ActionSubmit = {
  do?: 'submit'
} & ActionSubmit1
export type ActionSubmit1 = ActionSubmitInvoke | ActionSubmitSettings | ActionSubmitCreate | ActionSubmitUpdate
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "name".
 */
export type Name = string
/**
 * Ruta relativa de la app o http(s) literal; nunca $ref. Los externos solo con allowExternalLinks.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "link".
 */
export type Link = string
/**
 * StatFormat (superconjunto de WidgetFormat).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "statFormat".
 */
export type StatFormat = 'number' | 'currency' | 'percent' | 'compact' | 'date' | 'datetime' | 'relative_date'
/**
 * Tipos de campo (field.kind).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "fieldKind".
 */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'email'
  | 'url'
  | 'phone'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'switch'
  | 'select'
  | 'multiselect'
  | 'search'
/**
 * Ruta de escritura en el estado de la página: raíz state.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "statePath".
 */
export type StatePath = string
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "widgetSize".
 */
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full'

/**
 * Contrato declarativo de UI genui/v2 (ADR 0001 del SDK). Fuente única del contrato: de aquí salen los tipos TS; el kernel Go copia este archivo (packages/genui/conformance/README.md). Las reglas que el esquema no expresa (límites globales, unicidad de id, gramática de $ref, enlaces seguros, destino de open) viven en el validador.
 */
export interface GenuiV2 {
  version: 'genui/v2'
  title?: Label
  i18n?: 'keys' | 'literal'
  data?: {
    [k: string]: DataSource
  }
  /**
   * Estado local: escalares, listas de escalares y objetos de escalares o listas de escalares.
   */
  state?: {
    [k: string]: StateValue
  }
  overlays?: {
    [k: string]: Overlay
  }
  /**
   * @minItems 1
   * @maxItems 24
   */
  blocks: [Block, ...Block[]]
}
/**
 * Clave i18n con argumentos insertados como texto.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "tref".
 */
export interface Tref {
  $t: string
  args?: {
    [k: string]: (string | number | boolean) | Ref
  }
}
/**
 * Vinculación {"$ref": "<raíz>.<ruta>"} en posiciones de valor.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "ref".
 */
export interface Ref {
  $ref: BindingPath
}
/**
 * Fuente declarada de solo lectura: q | plan(+args) | widget | inline.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "dataSource".
 */
export interface DataSource {
  /**
   * Token de lectura del query batch.
   */
  q?: string
  plan?: 'model.list' | 'model.form' | 'dashboard.home'
  args?: {
    [k: string]: Scalar
  }
  widget?: string
  /**
   * @maxItems 200
   */
  inline?: Row[]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "row".
 */
export interface Row {
  [k: string]: Value
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "overlay".
 */
export interface Overlay {
  kind: 'modal' | 'drawer'
  title?: Label
  /**
   * @minItems 1
   * @maxItems 24
   */
  blocks: [Block, ...Block[]]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_stack".
 */
export interface BlockStack {
  type: 'stack'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  direction?: 'vertical' | 'horizontal'
  title?: Label
  /**
   * @minItems 1
   * @maxItems 24
   */
  blocks: [Block, ...Block[]]
}
/**
 * Condición when (forma de VisibleWhen ampliada a cualquier raíz).
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "predicate".
 */
export interface Predicate {
  ref: BindingPath
  equals?: Scalar
  /**
   * @maxItems 50
   */
  in?: Scalar[]
  /**
   * @maxItems 50
   */
  not_in?: Scalar[]
  empty?: boolean
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_grid".
 */
export interface BlockGrid {
  type: 'grid'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  /**
   * Número de columnas (1-4) o, con `areas`, una pista por columna.
   */
  columns?:
    | number
    | [GridTrack]
    | [GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack, GridTrack]
    | [
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack
      ]
    | [
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack,
        GridTrack
      ]
  /**
   * Pistas de fila (solo con `areas`).
   *
   * @minItems 1
   * @maxItems 24
   */
  rows?: [GridTrack, ...GridTrack[]]
  /**
   * Plantilla de regiones; cada hijo declara `area`.
   *
   * @minItems 1
   * @maxItems 24
   */
  areas?: [AreaRow, ...AreaRow[]]
  /**
   * Orden de regiones en pantalla angosta, una por fila.
   *
   * @minItems 1
   * @maxItems 24
   */
  mobile?: [Area, ...Area[]]
  title?: Label
  /**
   * @minItems 1
   * @maxItems 24
   */
  blocks: [Block, ...Block[]]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_tabs".
 */
export interface BlockTabs {
  type: 'tabs'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  state?: BindingPath
  /**
   * @minItems 1
   * @maxItems 8
   */
  tabs:
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
    | [
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        },
        {
          key: Key
          label: Label
          /**
           * @minItems 1
           * @maxItems 24
           */
          blocks?: [Block, ...Block[]]
          icon?: TabIcon
          permission?: PermissionKey
          component?: ExtName
          props?: ExtProps
        }
      ]
  variant?: 'tabs' | 'segmented'
  default?: Key
  keep_alive?: boolean
  chrome?: Chrome
  label?: Label
  mobile?: 'select' | 'scroll'
}
/**
 * Props escalares de un bloque custom; sin objetos libres.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "extProps".
 */
export interface ExtProps {
  [k: string]: Scalar | (string | number | boolean)[]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_section".
 */
export interface BlockSection {
  type: 'section'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  collapsible?: boolean
  collapsed?: boolean
  /**
   * @minItems 1
   * @maxItems 24
   */
  blocks?: [Block, ...Block[]]
  /**
   * declarative|hybrid usan `blocks`; custom usa `component`.
   */
  mode?: 'declarative' | 'hybrid' | 'custom'
  permission?: PermissionKey
  on_denied?: 'hide' | 'notice'
  chrome?: Chrome
  source?: Source
  empty?: Label
  component?: ExtName
  props?: ExtProps
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_text".
 */
export interface BlockText {
  type: 'text'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  text: Text
  tone?: Tone
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_markdown".
 */
export interface BlockMarkdown {
  type: 'markdown'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  markdown: string
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_alert".
 */
export interface BlockAlert {
  type: 'alert'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  text: Text
  tone?: Tone
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_empty".
 */
export interface BlockEmpty {
  type: 'empty'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title: Label
  text?: Text
  icon?: string
  actions?: Actions
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_navigate".
 */
export interface ActionNavigate {
  do: 'navigate'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  route: Route
}
/**
 * path o name; los requeridos por name se validan en código.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "route".
 */
export interface Route {
  name?: 'record' | 'list' | 'page'
  model?: Key
  id?: Value
  filters?: {
    [k: string]: Scalar
  }
  key?: Key
  path?: AppPath
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_invoke".
 */
export interface ActionInvoke {
  do: 'invoke'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  /**
   * Acción del manifest <addon>.<Model>.<key>.
   */
  action: string
  record?: Value
  params?: {
    [k: string]: Value
  }
  values?: {
    [k: string]: Value
  }
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_submit_invoke".
 */
export interface ActionSubmitInvoke {
  do: 'submit'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  to: 'invoke'
  form: Id
  action: string
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_submit_settings".
 */
export interface ActionSubmitSettings {
  do: 'submit'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  to: 'settings.write'
  form: Id
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_submit_create".
 */
export interface ActionSubmitCreate {
  do: 'submit'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  to: 'record.create'
  form: Id
  model: Key
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_submit_update".
 */
export interface ActionSubmitUpdate {
  do: 'submit'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  to: 'record.update'
  form: Id
  model: Key
  record: Value
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_open".
 */
export interface ActionOpen {
  do: 'open'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  overlay: Id
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_close".
 */
export interface ActionClose {
  do: 'close'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  overlay?: Id
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_set".
 */
export interface ActionSet {
  do: 'set'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  path: string
  value: Scalar
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_refresh".
 */
export interface ActionRefresh {
  do: 'refresh'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  source: Name
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "action_emit".
 */
export interface ActionEmit {
  do: 'emit'
  label?: Label
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  confirm?: {
    title?: Label
    body?: Text
    tone?: Tone
    require_text?: string
  }
  when?: Predicate
  id: string
  params?: {
    [k: string]: Scalar
  }
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_card".
 */
export interface BlockCard {
  type: 'card'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title: Label
  subtitle?: Label
  body?: Text
  /**
   * @maxItems 6
   */
  badges?:
    | []
    | [Badge]
    | [Badge, Badge]
    | [Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge, Badge, Badge]
  /**
   * @maxItems 12
   */
  fields?:
    | []
    | [Field]
    | [Field, Field]
    | [Field, Field, Field]
    | [Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
  link?: Link
  tone?: Tone
  actions?: Actions
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "badge".
 */
export interface Badge {
  label: string
  tone?: Tone
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "field".
 */
export interface Field {
  label: Label
  value?: Text
  copy?: boolean
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_list".
 */
export interface BlockList {
  type: 'list'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  /**
   * @minItems 1
   * @maxItems 50
   */
  items: [
    {
      title: Label
      description?: Text
      badge?: Badge
      action?: Action
    },
    ...{
      title: Label
      description?: Text
      badge?: Badge
      action?: Action
    }[]
  ]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_kpi".
 */
export interface BlockKpi {
  type: 'kpi'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  /**
   * @minItems 1
   * @maxItems 12
   */
  items:
    | [Item]
    | [Item, Item]
    | [Item, Item, Item]
    | [Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "item".
 */
export interface Item {
  label?: Label
  value?: Text
  hint?: Label
  trend?: 'up' | 'down' | 'flat'
  title?: Label
  url?: Link
  source?: Label
  date?: string
  time?: string
  description?: Text
  status?: string
  tone?: Tone
  format?: StatFormat
  action?: Action
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_kpi_card".
 */
export interface BlockKpiCard {
  type: 'kpi_card'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  label: Label
  value: Value
  format?: StatFormat
  trend?: ('up' | 'down' | 'flat') | Ref
  tone?: Tone
  hint?: Label
  cta?: Action
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_stats".
 */
export interface BlockStats {
  type: 'stats'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  source?: Source
  format?: StatFormat
  /**
   * @minItems 1
   * @maxItems 12
   */
  items?:
    | [Item]
    | [Item, Item]
    | [Item, Item, Item]
    | [Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
    | [Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item, Item]
  trend?: 'up' | 'down' | 'flat'
  compare?: string
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_links".
 */
export interface BlockLinks {
  type: 'links'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  /**
   * @minItems 1
   * @maxItems 50
   */
  items: [Item, ...Item[]]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_timeline".
 */
export interface BlockTimeline {
  type: 'timeline'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  /**
   * @minItems 1
   * @maxItems 50
   */
  items?: [Item, ...Item[]]
  source?: Source
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_table".
 */
export interface BlockTable {
  type: 'table'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  caption?: Label
  /**
   * @minItems 1
   * @maxItems 24
   */
  columns: [Column, ...Column[]]
  /**
   * @maxItems 200
   */
  rows?: Row[]
  source?: Source
  /**
   * @maxItems 12
   */
  filters?:
    | []
    | [Key]
    | [Key, Key]
    | [Key, Key, Key]
    | [Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
  sort?: {
    key: Key
    dir?: 'asc' | 'desc'
  }
  page_size?: number
  row_actions?: Actions
  bulk_actions?: Actions
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "column".
 */
export interface Column {
  key: Key
  label: Label
  format?: StatFormat
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_model_view".
 */
export interface BlockModelView {
  type: 'model_view'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  model: Key
  view?: 'table' | 'kanban' | 'calendar' | 'map' | 'timeline' | 'chart'
  filters?: {
    [k: string]: Scalar
  }
  /**
   * @maxItems 12
   */
  allowed_actions?:
    | []
    | [Key]
    | [Key, Key]
    | [Key, Key, Key]
    | [Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_view".
 */
export interface BlockView {
  type: 'view'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  model: Key
  record?: Value
  /**
   * @maxItems 40
   */
  fields?: Key[]
  /**
   * @maxItems 12
   */
  panels?:
    | []
    | [Key]
    | [Key, Key]
    | [Key, Key, Key]
    | [Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
    | [Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key, Key]
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_chart".
 */
export interface BlockChart {
  type: 'chart'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  kind: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'sparkline'
  x: Key
  /**
   * @minItems 1
   * @maxItems 6
   */
  series:
    | [Column]
    | [Column, Column]
    | [Column, Column, Column]
    | [Column, Column, Column, Column]
    | [Column, Column, Column, Column, Column]
    | [Column, Column, Column, Column, Column, Column]
  /**
   * @maxItems 500
   */
  rows?: Row[]
  source?: Source
  format?: StatFormat
  accent?: Tone
  summary: string
  caption?: Label
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_form".
 */
export interface BlockForm {
  type: 'form'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  description?: Text
  /**
   * @minItems 1
   * @maxItems 40
   */
  fields: [FormField, ...FormField[]]
  layout?: {
    mode?: 'sections' | 'steps'
    /**
     * @maxItems 8
     */
    steps?:
      | []
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
      | [
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          },
          {
            title: Label
            description?: Text
            /**
             * @minItems 1
             * @maxItems 40
             */
            fields: [Key, ...Key[]]
          }
        ]
  }
  submit?: Action
  actions?: Actions
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "formField".
 */
export interface FormField {
  key: Key
  label: Label
  kind: FieldKind
  required?: boolean
  /**
   * @maxItems 100
   */
  options?: Option[]
  value?: Value
  help?: string
  placeholder?: string
  /**
   * Clave de campo, columna o entrada: segmentos no vacíos [A-Za-z_][A-Za-z0-9_]* separados por punto (sin "a..b" ni "a."); ningún segmento puede ser __proto__, constructor ni prototype.
   */
  depends_on?: string
  visible_when?: {
    field?: Key
    equals?: Scalar
    /**
     * @maxItems 50
     */
    in?: Scalar[]
    /**
     * @maxItems 50
     */
    not_in?: Scalar[]
    empty?: boolean
  }
  validation?: {
    min?: number
    max?: number
    min_length?: number
    max_length?: number
    pattern?: string
  }
  widget?: string
  section?: string
  write_only?: boolean
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "option".
 */
export interface Option {
  value: string
  label: Label
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_wizard".
 */
export interface BlockWizard {
  type: 'wizard'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  description?: Text
  /**
   * @minItems 1
   * @maxItems 40
   */
  fields?: [FormField, ...FormField[]]
  /**
   * @minItems 1
   * @maxItems 8
   */
  steps?:
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
    | [
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        },
        {
          title: Label
          description?: Text
          /**
           * @minItems 1
           * @maxItems 40
           */
          fields: [Key, ...Key[]]
        }
      ]
  submit?: Action
  ref?: {
    action: string
  }
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_confirm".
 */
export interface BlockConfirm {
  type: 'confirm'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title: Label
  description?: Text
  /**
   * @maxItems 12
   */
  fields?:
    | []
    | [Field]
    | [Field, Field]
    | [Field, Field, Field]
    | [Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
    | [Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field, Field]
  /**
   * @maxItems 12
   */
  inputs?:
    | []
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
    | [
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        },
        {
          name: Key
          label: Label
          kind: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'time' | 'date'
          value?: Scalar
          required?: boolean
          /**
           * @maxItems 30
           */
          options?: Option[]
          help?: string
        }
      ]
  /**
   * @minItems 1
   * @maxItems 6
   */
  actions:
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
    | [
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        },
        {
          id: string
          label: string
          variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
          params?: {
            [k: string]: Scalar
          }
        }
      ]
  /**
   * @maxItems 6
   */
  badges?:
    | []
    | [Badge]
    | [Badge, Badge]
    | [Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge, Badge]
    | [Badge, Badge, Badge, Badge, Badge, Badge]
  tone?: Tone
}
/**
 * Solo por referencia; nunca en línea.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_settings".
 */
export interface BlockSettings {
  type: 'settings'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  addon: string
  /**
   * @maxItems 40
   */
  keys?: Key[]
  scope: 'org' | 'branch'
  section?: string
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_media".
 */
export interface BlockMedia {
  type: 'media'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  src: string
  alt: string
  width: number
  height: number
  caption?: Label
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_slot".
 */
export interface BlockSlot {
  type: 'slot'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  name: string
  record?: Value
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_ext".
 */
export interface BlockExt {
  type: 'ext'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  ext: ExtName
  props?: ExtProps
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_map".
 */
export interface BlockMap {
  type: 'map'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  /**
   * @maxItems 200
   */
  points?: MapPoint[]
  source?: Source
  fields?: MapFields
  /**
   * Color por estado: status -> Tone (nunca colores literales).
   */
  status_tones?: {
    [k: string]: Tone
  }
  group_by?: 'status' | 'group'
  legend?: boolean
  cluster?: boolean
  tooltip?: boolean
  /**
   * Panel lateral con el detalle del punto seleccionado.
   */
  detail_panel?: boolean
  on_select?: Action
  height?: 'sm' | 'md' | 'lg'
  /**
   * Resumen accesible (obligatorio).
   */
  summary: string
  select?: StatePath
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "mapPoint".
 */
export interface MapPoint {
  key: Key
  lat: number
  lng: number
  label: Label
  status?: string
  group?: string
  tone?: Tone
  /**
   * @maxItems 8
   */
  details?:
    | []
    | [
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
    | [
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        },
        {
          label?: Label
          value: Text
        }
      ]
}
/**
 * Columnas de la fuente que alimentan cada punto.
 *
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "mapFields".
 */
export interface MapFields {
  key?: Key
  lat?: Key
  lng?: Key
  label?: Key
  status?: Key
  group?: Key
  tone?: Key
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_metric".
 */
export interface BlockMetric {
  type: 'metric'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  label: Label
  value?: Value
  source?: Source
  field?: Key
  format?: StatFormat
  trend?: 'up' | 'down' | 'flat'
  delta?: string
  compare?: string
  tone?: Tone
  /**
   * Tono por severidad: el umbral mayor alcanzado por el valor gana.
   *
   * @maxItems 4
   */
  thresholds?:
    | []
    | [
        {
          at: number
          tone: Tone
        }
      ]
    | [
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        }
      ]
    | [
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        }
      ]
    | [
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        },
        {
          at: number
          tone: Tone
        }
      ]
  /**
   * @maxItems 60
   */
  spark?: number[]
  spark_field?: Key
  hint?: Label
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "block_diagram".
 */
export interface BlockDiagram {
  type: 'diagram'
  id?: Id
  when?: Predicate
  fallback?: string
  area?: Area
  title?: Label
  direction?: 'lr' | 'tb'
  /**
   * @minItems 1
   * @maxItems 60
   */
  nodes: [DiagramNode, ...DiagramNode[]]
  /**
   * @maxItems 120
   */
  edges?: DiagramEdge[]
  summary: string
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "diagramNode".
 */
export interface DiagramNode {
  id: Key
  label: Label
  kind?: 'service' | 'database' | 'queue' | 'user' | 'external' | 'group' | 'generic'
  tone?: Tone
  detail?: string
  route?: Route
}
/**
 * This interface was referenced by `GenuiV2`'s JSON-Schema
 * via the `definition` "diagramEdge".
 */
export interface DiagramEdge {
  from: Key
  to: Key
  label?: Label
  tone?: Tone
  style?: 'solid' | 'dashed'
}
