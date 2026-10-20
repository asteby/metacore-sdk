//
// Enum/status cells never show the raw value: a stage column with no options
// paints the translated stage label («Listo»), and an option whose label is an
// unresolved catalog key is translated (or humanized), never printed as a key.
import { describe, expect, it } from 'vitest'
import { resolveColumnOptions } from '../dynamic-columns-helpers'

const catalog: Record<string, string> = {
    'channel_orders.stage.ready': 'Listo',
    'channel_orders.stage.fulfilled': 'Cumplido',
    'channel_orders.option.channel.web': 'Web',
}
const t = (key: string, o?: { defaultValue?: string }) => catalog[key] ?? o?.defaultValue ?? key

const stages = [
    { key: 'imported', label: 'channel_orders.stage.imported', color: 'slate' },
    { key: 'ready', label: 'channel_orders.stage.ready', color: 'cyan' },
    { key: 'fulfilled', label: 'Cumplido (literal)', color: 'green' },
]

describe('resolveColumnOptions', () => {
    it('la columna de etapa sin options usa las etiquetas traducidas de stages', () => {
        const opts = resolveColumnOptions({ columnKey: 'status', stages, stageField: 'status', translate: t })!
        expect(opts.map((o) => [o.value, o.label])).toEqual([
            ['imported', 'Imported'], // sin traducción en el catálogo: humanizada, nunca la clave
            ['ready', 'Listo'],
            ['fulfilled', 'Cumplido (literal)'],
        ])
    })

    it('otra columna no toma las etapas', () => {
        expect(resolveColumnOptions({ columnKey: 'channel', stages, stageField: 'status', translate: t })).toBeUndefined()
    })

    it('labelKey no resuelta por el servidor se traduce en el cliente', () => {
        const opts = resolveColumnOptions({
            columnKey: 'channel',
            options: [{ value: 'web', label: 'Web', labelKey: 'channel_orders.option.channel.web' }],
            translate: t,
        })!
        expect(opts[0].label).toBe('Web')
    })

    it('las options propias de la columna ganan sobre las etapas', () => {
        const opts = resolveColumnOptions({
            columnKey: 'status',
            options: [{ value: 'ready', label: 'Propia' }],
            stages,
            stageField: 'status',
            translate: t,
        })!
        expect(opts).toEqual([{ value: 'ready', label: 'Propia' }])
    })
})
