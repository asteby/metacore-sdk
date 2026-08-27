// ColorPickerField — modern popover color control (SV plane + hue + hex).
// Used by PermissionsManager role dialog and DynamicForm `type: "color"`.
// Value is always a #rrggbb string (empty → falls back to DEFAULT_HEX visually).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import {
    Button,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@asteby/metacore-ui/primitives'

export const DEFAULT_ROLE_COLOR = '#3b82f6'

export interface ColorPickerFieldProps {
    value?: string
    onChange: (hex: string) => void
    /** Optional label for a11y on the trigger. */
    'aria-label'?: string
    className?: string
    disabled?: boolean
}

type HSV = { h: number; s: number; v: number }

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n))
}

/** Normalize to #rrggbb or '' if invalid. */
export function normalizeHex(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    let s = raw.trim()
    if (!s) return ''
    if (s[0] !== '#') s = `#${s}`
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        const r = s[1],
            g = s[2],
            b = s[3]
        s = `#${r}${r}${g}${g}${b}${b}`
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return ''
    return s.toLowerCase()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const n = normalizeHex(hex)
    if (!n) return null
    return {
        r: parseInt(n.slice(1, 3), 16),
        g: parseInt(n.slice(3, 5), 16),
        b: parseInt(n.slice(5, 7), 16),
    }
}

function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) =>
        clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
    return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsv(r: number, g: number, b: number): HSV {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    let h = 0
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : d / max
    return { h, s, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c
    let rp = 0,
        gp = 0,
        bp = 0
    if (h < 60) [rp, gp, bp] = [c, x, 0]
    else if (h < 120) [rp, gp, bp] = [x, c, 0]
    else if (h < 180) [rp, gp, bp] = [0, c, x]
    else if (h < 240) [rp, gp, bp] = [0, x, c]
    else if (h < 300) [rp, gp, bp] = [x, 0, c]
    else [rp, gp, bp] = [c, 0, x]
    return {
        r: (rp + m) * 255,
        g: (gp + m) * 255,
        b: (bp + m) * 255,
    }
}

function hexToHsv(hex: string): HSV {
    const rgb = hexToRgb(hex) || hexToRgb(DEFAULT_ROLE_COLOR)!
    return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

function hsvToHex(hsv: HSV): string {
    const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
    return rgbToHex(r, g, b)
}

function hueCss(h: number): string {
    const { r, g, b } = hsvToRgb(h, 1, 1)
    return rgbToHex(r, g, b)
}

export function ColorPickerField({
    value,
    onChange,
    'aria-label': ariaLabel = 'Color',
    className,
    disabled,
}: ColorPickerFieldProps) {
    const hex = normalizeHex(value) || DEFAULT_ROLE_COLOR
    const [open, setOpen] = useState(false)
    const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hex))
    const [hexDraft, setHexDraft] = useState(hex)
    const svRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)

    // Sync from external value when popover closed (or first open).
    useEffect(() => {
        if (dragging.current) return
        const next = normalizeHex(value) || DEFAULT_ROLE_COLOR
        setHsv(hexToHsv(next))
        setHexDraft(next)
    }, [value, open])

    const commit = useCallback(
        (next: HSV) => {
            setHsv(next)
            const out = hsvToHex(next)
            setHexDraft(out)
            onChange(out)
        },
        [onChange],
    )

    const setFromPointer = useCallback(
        (clientX: number, clientY: number) => {
            const el = svRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            const s = clamp((clientX - rect.left) / rect.width, 0, 1)
            const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
            commit({ ...hsv, s, v })
        },
        [commit, hsv],
    )

    useEffect(() => {
        if (!open) return
        const onMove = (e: PointerEvent) => {
            if (!dragging.current) return
            setFromPointer(e.clientX, e.clientY)
        }
        const onUp = () => {
            dragging.current = false
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
    }, [open, setFromPointer])

    const svStyle = useMemo(
        () => ({
            background: `
        linear-gradient(to top, #000, transparent),
        linear-gradient(to right, #fff, ${hueCss(hsv.h)})
      `,
        }),
        [hsv.h],
    )

    const applyHexDraft = () => {
        const n = normalizeHex(hexDraft)
        if (!n) {
            setHexDraft(hsvToHex(hsv))
            return
        }
        setHsv(hexToHsv(n))
        setHexDraft(n)
        onChange(n)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-label={ariaLabel}
                    className={cn(
                        'h-10 w-full justify-start gap-3 px-2.5 font-normal',
                        className,
                    )}
                >
                    <span
                        className="h-6 w-6 shrink-0 rounded-md border border-black/10 shadow-sm ring-1 ring-black/5 dark:border-white/10"
                        style={{ background: hex }}
                        aria-hidden
                    />
                    <span className="font-mono text-sm uppercase tracking-wide text-foreground">
                        {hex}
                    </span>
                    <Pipette className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-3" align="start">
                <div className="flex flex-col gap-3">
                    <div
                        ref={svRef}
                        role="slider"
                        aria-label="Saturación y brillo"
                        tabIndex={0}
                        className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-border/60"
                        style={svStyle}
                        onPointerDown={(e) => {
                            dragging.current = true
                            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                            setFromPointer(e.clientX, e.clientY)
                        }}
                    >
                        <span
                            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/30"
                            style={{
                                left: `${hsv.s * 100}%`,
                                top: `${(1 - hsv.v) * 100}%`,
                                background: hsvToHex(hsv),
                            }}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Tono
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={360}
                            step={1}
                            value={Math.round(hsv.h)}
                            aria-label="Tono"
                            onChange={(e) =>
                                commit({ ...hsv, h: Number(e.target.value) })
                            }
                            className="h-3 w-full cursor-pointer appearance-none rounded-full"
                            style={{
                                background:
                                    'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-9 w-9 shrink-0 rounded-md border border-black/10 shadow-inner ring-1 ring-black/5"
                            style={{ background: hsvToHex(hsv) }}
                            aria-hidden
                        />
                        <Input
                            value={hexDraft}
                            spellCheck={false}
                            aria-label="Hexadecimal"
                            className="h-9 font-mono uppercase"
                            onChange={(e) => setHexDraft(e.target.value)}
                            onBlur={applyHexDraft}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    applyHexDraft()
                                }
                            }}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
