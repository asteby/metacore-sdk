// DashboardEmptyMockup — the animated empty state for the modular dashboard.
//
// The whole grid REORGANIZES on a loop: skeleton widget cards grow, shrink and
// reflow through four dashboard compositions (A → B → C → D → A), as if the
// board were trying out arrangements while it loads. No "empty" copy — the
// motion carries the meaning.
//
// ── The zero-overlap invariant (hard requirement) ──────────────────────────
// Two earlier takes let tiles cross and overlap; the user rejected them. This
// version makes overlap IMPOSSIBLE by construction, not by tuning:
//
//   The board is 3 COLUMNS in a FIXED left-to-right order, each split into a
//   TOP and BOTTOM tile — 6 tiles total. Every layout only changes the column
//   WIDTHS and the per-column top/bottom SPLIT. Because column order never
//   changes and top is always above bottom, EVERY pair of tiles keeps a
//   consistent separating axis in every layout, with a constant `gap` between
//   neighbours. Under linear interpolation a gap that is `gap` at both ends of
//   a transition stays exactly `gap` throughout — so no two tiles can ever
//   touch, at any frame, during any transition. (Verified independently by the
//   interpolation check in dashboard-empty-mockup.test — 0 overlaps.)
//
// Design constraints kept from the spec:
//   - Full-bleed (fills the whole dashboard area).
//   - Pure CSS keyframes, no dependencies; injected once per document.
//   - Synchronised reflow: all tiles share one duration / easing / timing, so
//     A→B reads as a single reorganisation. ~2s rest per layout, ~1.2s glide.
//   - Theme tokens only (bg-card / border / muted) → light & dark for free.
//   - `prefers-reduced-motion: reduce` → the static A layout, no motion.
//   - Decorative → aria-hidden, no text.

import * as React from 'react'
import { cn } from '@asteby/metacore-ui/lib'

const STYLE_ID = 'mc-dashboard-empty-mockup-style'

/** A tile's rectangle in percent of the container (both axes 0–100). */
export interface MockupRect {
    x: number
    y: number
    w: number
    h: number
}

// Each layout = three column width weights + each column's top-tile height
// fraction. Weights are relative (normalised below), so they read as intent
// ("this column is the wide one") rather than exact percentages.
interface LayoutSpec {
    widths: [number, number, number]
    splits: [number, number, number]
}

// Four visibly different compositions: balanced → left-heavy → centre-heavy →
// right-heavy. The loop returns to A, so it is seamless.
export const MOCKUP_LAYOUTS: LayoutSpec[] = [
    { widths: [40, 32, 28], splits: [0.5, 0.6, 0.45] },
    { widths: [52, 24, 24], splits: [0.62, 0.4, 0.55] },
    { widths: [24, 52, 24], splits: [0.4, 0.55, 0.62] },
    { widths: [26, 28, 46], splits: [0.55, 0.5, 0.4] },
]

/** Horizontal/vertical gap between tiles, in percent. */
export const MOCKUP_GAP = 3

/**
 * Computes the six tile rects for one layout. Tile order is
 * [c0-top, c0-bottom, c1-top, c1-bottom, c2-top, c2-bottom].
 *
 * Columns keep a constant `gap` between them and top/bottom keep a constant
 * `gap` between them — this is what makes every transition overlap-free.
 */
export function computeLayoutRects(layout: LayoutSpec, gap = MOCKUP_GAP): MockupRect[] {
    const usableW = 100 - 2 * gap
    const usableH = 100 - gap
    const sum = layout.widths[0] + layout.widths[1] + layout.widths[2]
    const colW = layout.widths.map((w) => (w / sum) * usableW) as [number, number, number]
    const colX = [0, colW[0] + gap, colW[0] + colW[1] + 2 * gap]

    const rects: MockupRect[] = []
    for (let c = 0; c < 3; c++) {
        const topH = layout.splits[c] * usableH
        const botH = usableH - topH
        rects.push({ x: colX[c], y: 0, w: colW[c], h: topH })
        rects.push({ x: colX[c], y: topH + gap, w: colW[c], h: botH })
    }
    return rects
}

/** The precomputed rects for all four layouts (exported for the overlap test). */
export function mockupLayoutRects(gap = MOCKUP_GAP): MockupRect[][] {
    return MOCKUP_LAYOUTS.map((l) => computeLayoutRects(l, gap))
}

// Keyframe stops. Cycle = 12.8s: per layout ~2s rest + ~1.2s glide. The stops
// hold each layout, then glide to the next; 100% == 0% (layout A) → seamless.
const STOPS = [0, 15.625, 25, 40.625, 50, 65.625, 75, 90.625, 100]
const STOP_LAYOUT = [0, 0, 1, 1, 2, 2, 3, 3, 0] // which layout at each stop

const fmt = (n: number) => `${Math.round(n * 1000) / 1000}%`

/** Builds the full <style> text: per-tile keyframes cycling through the rects. */
function buildCss(): string {
    const layouts = mockupLayoutRects()
    const tiles = layouts[0].length
    let css = `
.mc-demock{position:relative;height:100%;width:100%}
.mc-demock-tile{position:absolute;
  animation-duration:12.8s;animation-timing-function:cubic-bezier(.65,0,.35,1);
  animation-iteration-count:infinite;will-change:top,left,width,height}
.mc-demock-shimmer{overflow:hidden}
.mc-demock-shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 35%,currentColor 50%,transparent 65%);
  opacity:.045;transform:translateX(-120%);
  animation:mc-demock-sheen 12.8s ease-in-out infinite}
@keyframes mc-demock-sheen{0%,100%{transform:translateX(-120%)}55%,72%{transform:translateX(120%)}}
`
    for (let i = 0; i < tiles; i++) {
        css += `.mc-demock-t${i}{animation-name:mc-demock-k${i}}\n@keyframes mc-demock-k${i}{`
        for (let s = 0; s < STOPS.length; s++) {
            const r = layouts[STOP_LAYOUT[s]][i]
            css += `${fmt(STOPS[s])}{left:${fmt(r.x)};top:${fmt(r.y)};width:${fmt(r.w)};height:${fmt(r.h)}}`
        }
        css += `}\n`
    }
    css += `@media (prefers-reduced-motion:reduce){.mc-demock-tile{animation:none!important}.mc-demock-shimmer::after{animation:none!important;opacity:0}}\n`
    return css
}

/** Injects the keyframes once per document (idempotent, SSR-safe). */
function useMockupStyles() {
    React.useInsertionEffect(() => {
        if (typeof document === 'undefined') return
        if (document.getElementById(STYLE_ID)) return
        const el = document.createElement('style')
        el.id = STYLE_ID
        el.textContent = buildCss()
        document.head.appendChild(el)
    }, [])
}

const tileBase =
    'rounded-lg border border-border/60 bg-card mc-demock-tile mc-demock-shimmer text-foreground'

type Glyph = 'chart' | 'stat' | 'list' | 'bar'

// Header shared by every card kind — icon chip + title bar + subtitle bar,
// mirroring the real WidgetCard chrome (widgets/widget-card.tsx).
function SkeletonHeader() {
    return (
        <div className="flex items-start gap-2.5">
            <div className="size-8 shrink-0 rounded-lg bg-foreground/10" />
            <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-2.5 w-2/3 rounded bg-foreground/12" />
                <div className="h-2 w-2/5 rounded bg-foreground/[.07]" />
            </div>
        </div>
    )
}

// Bodies copy the anatomy of the matching real renderers (renderers.tsx).
function TileGlyph({ kind }: { kind: Glyph }) {
    return (
        <div className="flex h-full flex-col gap-3 overflow-hidden p-3">
            <SkeletonHeader />
            <div className="min-h-0 flex-1">
                {kind === 'stat' && (
                    <div className="flex h-full flex-col justify-center gap-2">
                        <div className="h-6 w-1/2 rounded-md bg-foreground/15" />
                        <div className="h-4 w-14 rounded-full bg-foreground/10" />
                    </div>
                )}
                {kind === 'chart' && (
                    <div className="flex h-full items-end gap-1.5">
                        {[46, 72, 38, 84, 58, 92, 50].map((h, i) => (
                            <div
                                key={i}
                                className="w-full rounded-sm bg-foreground/10"
                                style={{ height: `${h}%` }}
                            />
                        ))}
                    </div>
                )}
                {kind === 'list' && (
                    <div className="flex h-full flex-col justify-center gap-2.5">
                        {[28, 40, 34].map((w, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="size-5 shrink-0 rounded-full bg-foreground/10" />
                                <div className="h-2 flex-1 rounded-full bg-foreground/10" />
                                <div
                                    className="h-2 shrink-0 rounded-full bg-foreground/12"
                                    style={{ width: w }}
                                />
                            </div>
                        ))}
                    </div>
                )}
                {kind === 'bar' && (
                    <div className="flex h-full flex-col justify-center gap-3">
                        <div className="h-2.5 w-full rounded-full bg-foreground/10">
                            <div className="h-full w-3/5 rounded-full bg-foreground/20" />
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-foreground/10">
                            <div className="h-full w-2/5 rounded-full bg-foreground/20" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// Kind per tile, in the [c0-top, c0-bottom, c1-top, c1-bottom, c2-top, c2-bottom]
// order used by computeLayoutRects.
const TILE_KINDS: Glyph[] = ['stat', 'chart', 'chart', 'list', 'stat', 'bar']

/**
 * Full-bleed skeleton dashboard that reflows through four layouts on a loop.
 * Overlap-free by construction (see the invariant note above). Purely
 * decorative — always `aria-hidden`, no text.
 */
export function DashboardEmptyMockup({ className }: { className?: string }) {
    useMockupStyles()
    const layoutA = React.useMemo(() => computeLayoutRects(MOCKUP_LAYOUTS[0]), [])
    return (
        <div
            aria-hidden="true"
            data-testid="dashboard-empty-mockup"
            className={cn('mc-demock pointer-events-none select-none', className)}
        >
            {layoutA.map((r, i) => (
                <div
                    key={i}
                    data-mockup-tile="tile"
                    className={cn(tileBase, `mc-demock-t${i}`)}
                    // Base position = layout A, so reduced-motion (animation off)
                    // shows the full static composition.
                    style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
                >
                    <TileGlyph kind={TILE_KINDS[i]} />
                </div>
            ))}
        </div>
    )
}
