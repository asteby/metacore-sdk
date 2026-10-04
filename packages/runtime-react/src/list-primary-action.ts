// Una sola acción primaria de alta por pantalla (UX-1).
// Puro: DynamicCRUDPage y ModelActionToolbar lo usan, y el shell de ops
// (`/m/$model`) debe llamarlo también para no pintar un segundo «Crear».

export type CreateMode = 'generic' | 'hidden' | 'action'

export interface ListActionRef {
    key: string
    placement?: string
    /** El kernel sirve snake_case. CamelCase se acepta por si el host ya lo normalizó. */
    replaces_create?: boolean
    replacesCreate?: boolean
}

export interface ListPrimaryActionInput {
    /** `metadata.enableCRUDActions`. Sin él no hay Crear genérico. */
    enableCRUD?: boolean
    /** `metadata.canCreate`. `false` oculta el genérico; `undefined` no cambia nada. */
    canCreate?: boolean
    hideCreate?: boolean
    createMode?: CreateMode
    /** Si apunta a una acción de toolbar, esa es la primaria y oculta el genérico. */
    primaryActionKey?: string
    actions?: ListActionRef[]
}

export interface ListPrimaryActionResult {
    showGenericCreate: boolean
    primaryAction?: ListActionRef
    /** Acciones de toolbar que no son la primaria (siguen visibles, en secundario). */
    secondaryActions: ListActionRef[]
    /** Más de una acción reclama ser la primaria. Solo una se usa. */
    conflict: boolean
}

/** `placement: create`, o el flag declarativo para una acción que hoy es `table`. */
export function actionReplacesCreate(action: ListActionRef): boolean {
    return action.placement === 'create' || action.replaces_create === true || action.replacesCreate === true
}

function isToolbar(action: ListActionRef): boolean {
    const placement = action.placement ?? 'row'
    return placement === 'table' || placement === 'create' || actionReplacesCreate(action)
}

export function resolveListPrimaryAction(input: ListPrimaryActionInput): ListPrimaryActionResult {
    const actions = input.actions ?? []
    const claimants = actions.filter(actionReplacesCreate)

    let primary: ListActionRef | undefined
    if (input.primaryActionKey) {
        const keyed = actions.find((a) => a.key === input.primaryActionKey)
        if (keyed && isToolbar(keyed)) primary = keyed
    }
    if (!primary && claimants.length > 0) primary = claimants[0]

    const hideGeneric =
        input.hideCreate === true ||
        input.canCreate === false ||
        input.createMode === 'hidden' ||
        input.createMode === 'action' ||
        input.enableCRUD !== true ||
        primary != null

    return {
        showGenericCreate: !hideGeneric,
        primaryAction: primary,
        secondaryActions: actions.filter((a) => isToolbar(a) && a.key !== primary?.key),
        conflict: claimants.length > 1,
    }
}
