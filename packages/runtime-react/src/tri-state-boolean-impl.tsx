// Control de tres estados para booleanos opcionales (ver nullable-boolean.ts).
// Se carga diferido desde tri-state-boolean.tsx para no pesar en el shell.
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '@asteby/metacore-ui/primitives'

export type TriState = 'true' | 'false' | 'null'

/** Valor de formulario → estado del control. `''`/null/undefined son «Sin definir». */
export function toTriState(value: unknown): TriState {
    if (value === true || value === 'true') return 'true'
    if (value === false || value === 'false') return 'false'
    return 'null'
}

/** Estado del control → valor que viaja al servidor. */
export function fromTriState(state: TriState): boolean | null {
    if (state === 'true') return true
    if (state === 'false') return false
    return null
}

export interface TriStateBooleanFieldProps {
    id?: string
    value: unknown
    onChange: (value: boolean | null) => void
    disabled?: boolean
    /** Nombre accesible del grupo (la etiqueta del campo; se traduce como las demás). */
    label?: string
    /** id del <label> visible: el radiogroup no es «labelable», se asocia por aria-labelledby. */
    labelledBy?: string
    size?: 'sm' | 'default'
    invalid?: boolean
}

/**
 * Control de tres estados para un booleano opcional. Es un `radiogroup`
 * (SegmentedControl de metacore-ui): flechas para moverse, el estado elegido
 * se marca con relleno y `aria-checked`. «Sin definir» envía `null`.
 */
export function TriStateBooleanField({
    id,
    value,
    onChange,
    disabled,
    label,
    labelledBy,
    size = 'sm',
    invalid,
}: TriStateBooleanFieldProps) {
    const { t } = useTranslation()
    const items = [
        { value: 'true' as const, label: t('common.yes', { defaultValue: 'Sí' }), disabled },
        { value: 'false' as const, label: t('common.no', { defaultValue: 'No' }), disabled },
        { value: 'null' as const, label: t('common.unset', { defaultValue: 'Sin definir' }), disabled },
    ]
    return (
        <SegmentedControl<TriState>
            id={id}
            items={items}
            value={toTriState(value)}
            onValueChange={(s) => onChange(fromTriState(s))}
            aria-label={label ? t(label, { defaultValue: label }) : t('common.unset', { defaultValue: 'Sin definir' })}
            aria-labelledby={labelledBy}
            aria-invalid={invalid || undefined}
            aria-disabled={disabled || undefined}
            data-tri-state=""
            size={size}
            className="w-fit"
        />
    )
}
