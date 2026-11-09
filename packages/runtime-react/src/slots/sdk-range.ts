// Comprobación mínima de rangos semver para `manifest.frontend.sdk`
// (p. ej. "^4.0.0", ">=3.2 <5", "~3.18", "3.x", "^3 || ^4"). Sin dependencias.
// Un rango que no se entiende devuelve `null` (desconocido): el llamador NO lo
// trata como incompatible, para no romper addons por un rango exótico.

type V = [number, number, number]

function parseVersion(s: string): V | null {
    const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(s.trim())
    if (!m) return null
    return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

function cmp(a: V, b: V): number {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
    return 0
}

/** Un comparador simple (`^1.2.3`, `>=1`, `1.x`, `=1.2.3`) contra `v`. null = no se entiende. */
function matchComparator(token: string, v: V): boolean | null {
    const m = /^(\^|~|>=|<=|>|<|=)?\s*v?([\dxX*]+(?:\.[\dxX*]+){0,2}(?:[-+][\w.-]+)?)$/.exec(token)
    if (!m) return null
    const op = m[1] ?? ''
    const raw = m[2]
    const parts = raw.split(/[-+]/)[0].split('.')
    const isWild = (p: string | undefined) => p === undefined || /^[xX*]$/.test(p)
    const nums = parts.map((p) => (isWild(p) ? null : Number(p)))
    if (nums[0] === null) return op === '<' ? false : true // "*" / "x"
    const lo: V = [nums[0], nums[1] ?? 0, nums[2] ?? 0]
    const specified = nums.filter((n) => n !== null).length // 1..3
    // Límite superior exclusivo para comodín / parcial ("1.2" => <1.3.0).
    const bump = (n: number): V => (n === 1 ? [lo[0] + 1, 0, 0] : n === 2 ? [lo[0], lo[1] + 1, 0] : [lo[0], lo[1], lo[2] + 1])
    switch (op) {
        case '':
        case '=':
            return cmp(v, lo) >= 0 && cmp(v, bump(specified)) < 0
        case '>=':
            return cmp(v, lo) >= 0
        case '>':
            return cmp(v, bump(specified)) >= 0
        case '<':
            return cmp(v, lo) < 0
        case '<=':
            return cmp(v, bump(specified)) < 0
        case '~':
            return cmp(v, lo) >= 0 && cmp(v, bump(specified === 1 ? 1 : 2)) < 0
        case '^': {
            let hi: V
            if (lo[0] > 0 || specified === 1) hi = [lo[0] + 1, 0, 0]
            else if (lo[1] > 0 || specified === 2) hi = [0, lo[1] + 1, 0]
            else hi = [0, 0, lo[2] + 1]
            return cmp(v, lo) >= 0 && cmp(v, hi) < 0
        }
    }
    return null
}

/**
 * ¿`version` cumple `range`? `true`/`false` si ambos se entienden, `null` si
 * alguno no (rango vacío o versión ilegible = sin restricción conocida).
 */
export function satisfiesSdkRange(version: string | undefined, range: string | undefined): boolean | null {
    if (!version || !range || !range.trim()) return null
    const v = parseVersion(version)
    if (!v) return null
    let unknown = false
    for (const alt of range.split('||')) {
        // "1.2.3 - 2.0.0" no se soporta: cae en `unknown`.
        const tokens = alt.trim().split(/\s+/).filter(Boolean)
        if (tokens.length === 0) {
            return true
        }
        let ok = true
        for (const t of tokens) {
            const r = matchComparator(t, v)
            if (r === null) {
                unknown = true
                ok = false
                break
            }
            if (!r) ok = false
        }
        if (ok) return true
    }
    return unknown ? null : false
}
