import { describe, expect, it } from 'vitest'
import { es } from 'date-fns/locale'
import { parseCalendarDate } from '../calendar-date'
import { formatDateCell } from '../dynamic-columns'

describe('parseCalendarDate', () => {
    it('lee UTC medianoche como el mismo día local (PIT-025)', () => {
        const d = parseCalendarDate('2026-09-27T00:00:00Z')!
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 27])
    })

    it('acepta YYYY-MM-DD y vacíos', () => {
        expect(parseCalendarDate('2026-01-05')!.getDate()).toBe(5)
        expect(parseCalendarDate('')).toBeUndefined()
        expect(parseCalendarDate(null)).toBeUndefined()
        expect(parseCalendarDate('no es fecha')).toBeUndefined()
    })

    it('la celda date sin zona de la org no retrocede un día', () => {
        expect(formatDateCell('2026-09-27T00:00:00Z', 'date', es)?.display).toContain('27')
    })
})
