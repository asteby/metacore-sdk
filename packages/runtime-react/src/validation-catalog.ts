/** Laravel-style validation catalogs. Hosts override any key via i18next
 *  `validation.<code>`; these are the defaults when the key is missing, picked
 *  by the operator's language (es by default — the product language). */

export const VALIDATION_CATALOGS: Record<string, Record<string, string>> = {
    es: {
        failed: 'Revisa los campos marcados',
        required: 'El campo {{label}} es obligatorio',
        invalid_option: 'El valor de {{label}} no es válido',
        not_found: 'El {{label}} seleccionado no existe',
        duplicate: 'Ya existe un registro con ese {{label}}',
        invalid_type: 'El campo {{label}} tiene un formato inválido',
        min: 'El campo {{label}} debe ser al menos {{min}}',
        min_length: '{{label}} debe tener al menos {{min}} caracteres',
        max: 'El campo {{label}} no puede ser mayor que {{max}}',
        max_length: '{{label}} no puede tener más de {{max}} caracteres',
        regex: 'El formato de {{label}} no es válido',
        email: '{{label}} debe ser un correo válido',
        uuid: '{{label}} no es un identificador válido',
        url: '{{label}} debe ser una URL válida',
        numeric: '{{label}} debe ser un número',
        integer: '{{label}} debe ser un entero',
        custom: '{{label}} no es válido',
        line_items_required: '{{label}} requiere al menos un renglón',
        fallback: '{{label}}: valor inválido',
    },
    en: {
        failed: 'Please check the highlighted fields',
        required: 'The {{label}} field is required',
        invalid_option: 'The selected {{label}} is invalid',
        not_found: 'The selected {{label}} does not exist',
        duplicate: 'A record with that {{label}} already exists',
        invalid_type: 'The {{label}} field has an invalid format',
        min: 'The {{label}} must be at least {{min}}',
        min_length: 'The {{label}} must be at least {{min}} characters',
        max: 'The {{label}} may not be greater than {{max}}',
        max_length: 'The {{label}} may not be greater than {{max}} characters',
        regex: 'The {{label}} format is invalid',
        email: 'The {{label}} must be a valid email address',
        uuid: 'The {{label}} is not a valid identifier',
        url: 'The {{label}} must be a valid URL',
        numeric: 'The {{label}} must be a number',
        integer: 'The {{label}} must be an integer',
        custom: 'The {{label}} is invalid',
        line_items_required: '{{label}} requires at least one row',
        fallback: '{{label}}: invalid value',
    },
}

export function validationCatalog(language?: string): Record<string, string> {
    const short = (language ?? 'es').split(/[-_]/)[0]!.toLowerCase()
    return VALIDATION_CATALOGS[short] ?? VALIDATION_CATALOGS.es!
}

/** Pick the catalog key for a code, folding min/max + kind=length into *_length. */
export function validationMessageKey(code: string, params?: Record<string, unknown>): string {
    if (code === 'min' && params?.kind === 'length') return 'min_length'
    if (code === 'max' && params?.kind === 'length') return 'max_length'
    return code
}
