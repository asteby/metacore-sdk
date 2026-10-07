// command / popover / multi-select ya no son copias: starter-core re-exporta
// los de @asteby/metacore-ui (una sola implementación), sin romper sus exports.
import { describe, expect, it } from 'vitest'
import * as ui from '@asteby/metacore-ui/primitives'
import * as command from '../ui/command'
import * as popover from '../ui/popover'
import * as multiSelect from '../ui/multi-select'

const starter = { ...command, ...popover, ...multiSelect }

describe('starter-core re-exporta los primitivos de metacore-ui', () => {
    it.each([
        'Command',
        'CommandDialog',
        'CommandInput',
        'CommandList',
        'CommandEmpty',
        'CommandGroup',
        'CommandItem',
        'CommandShortcut',
        'CommandSeparator',
        'Popover',
        'PopoverTrigger',
        'PopoverContent',
        'PopoverAnchor',
        'MultiSelect',
    ] as const)('%s es el mismo componente', (name) => {
        expect((starter as Record<string, unknown>)[name]).toBeTypeOf('function')
        expect((starter as Record<string, unknown>)[name]).toBe((ui as Record<string, unknown>)[name])
    })
})
