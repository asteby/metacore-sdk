import { describe, expect, it } from 'vitest'
import { isActionAllowedForRowState, isRowActionVisible, lifecycleStageField } from './dynamic-columns'

// Pitsline taller: WorkOrder has a stage machine (stage_field "stage") and its
// row actions declare requiresState with STAGE keys. The kernel gates on the
// stage column; the UI must do the same or every action is hidden (the OT
// row/kanban menu showed only Ver/Editar/Eliminar).
describe('requiresState gate with a stage machine', () => {
    const process = { key: 'process', requiresState: ['reception', 'diagnosis', 'in_process'] }
    const row = { id: '1', status: 'open', stage: 'diagnosis' }

    it('reads the stage field when the model declares one', () => {
        expect(isActionAllowedForRowState(process, row, 'stage')).toBe(true)
        expect(isRowActionVisible(process, row, 'stage')).toBe(true)
        expect(isActionAllowedForRowState(process, { ...row, stage: 'delivered' }, 'stage')).toBe(false)
    })

    it('keeps the historical status/state lookup without a stage field', () => {
        expect(isActionAllowedForRowState(process, row)).toBe(false)
        expect(isActionAllowedForRowState({ requiresState: ['open'] }, row)).toBe(true)
    })

    it('falls back to status when the stage value is blank', () => {
        expect(isActionAllowedForRowState({ requiresState: ['open'] }, { status: 'open', stage: '' }, 'stage')).toBe(true)
    })

    it('resolves the stage field from metadata', () => {
        expect(lifecycleStageField({ stage_field: 'stage' })).toBe('stage')
        expect(lifecycleStageField({ stages: [{ key: 'a' }], group_by: 'stage' })).toBe('stage')
        expect(lifecycleStageField({ group_by: 'status' })).toBeUndefined()
        expect(lifecycleStageField(undefined)).toBeUndefined()
    })
})
