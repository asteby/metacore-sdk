import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Radix context guard: a component that renders RowActionMenuItem (whose
// DropdownMenuItem is imported from the ROOT '@asteby/metacore-ui' entry) must
// import its DropdownMenu shell from the root entry too. Hosts share the root
// entry as a Module Federation singleton but bundle '/primitives' locally, so
// mixing entries creates two Menu contexts → "`MenuItem` must be used within
// `Menu`" at runtime (Pitsline kanban card menu crash, 2026-10-05).
describe('dropdown menu entry consistency', () => {
    const dir = join(__dirname)
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    for (const f of files) {
        const src = readFileSync(join(dir, f), 'utf8')
        if (!src.includes('<RowActionMenuItem')) continue
        it(`${f} imports DropdownMenu from the root ui entry`, () => {
            const primitivesImport = src.match(/import\s*{([^}]*)}\s*from\s*'@asteby\/metacore-ui\/primitives'/)
            const fromPrimitives = primitivesImport ? primitivesImport[1] : ''
            expect(fromPrimitives).not.toMatch(/\bDropdownMenu(Content|Trigger)?\b/)
        })
    }
})
