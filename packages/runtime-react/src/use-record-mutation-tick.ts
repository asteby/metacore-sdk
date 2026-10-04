import { useEffect, useState } from 'react'
import { subscribeRecordMutations } from './record-mutation-events'

/**
 * A counter that increments whenever a record of `model` is created, updated
 * or deleted anywhere in the app. Fold it into a list's refetch deps.
 */
export function useRecordMutationTick(model: string | undefined | null): number {
    const [tick, setTick] = useState(0)
    useEffect(() => subscribeRecordMutations(model, () => setTick((n) => n + 1)), [model])
    return tick
}
