// DashboardEmptyMockup — the animated empty state for the modular dashboard.
//
// A sliding-tile puzzle (15-puzzle) built from dashboard skeleton tiles. The
// board is a fixed 4×3 grid of equal slots with ONE empty slot; the only motion
// allowed is a tile ADJACENT to the gap sliding one slot into it. One tile
// moves at a time, exactly one slot, so tiles NEVER cross or overlap — the
// no-overlap invariant holds by construction, not by luck. The metaphor is a
// board quietly organizing itself, not "empty".
//
// Choreography (closed loop, seamless):
//   The gap starts at slot (col4,row1). It wanders a 5-step path and then
//   retraces that exact path in reverse, which returns every tile to its home
//   slot — so frame 0 and frame 100% are identical and the loop never jumps.
//   Only 5 tiles ever move; each slides out once and back once. Between moves
//   there is a ~1.4s pause (calm "settling" rhythm).
//
// Design constraints:
//   - Full-bleed: the grid fills the whole dashboard area (100% w/h).
//   - Pure CSS keyframes, no dependencies; injected once per document.
//   - One move = translate of exactly one slot (100% of a cell + the gap),
//     ~0.6s ease-in-out. Never two tiles in transit at once.
//   - Theme tokens only (bg-muted / foreground) → light & dark for free.
//   - `prefers-reduced-motion: reduce` → the full static grid, gap filled, no
//     motion. Decorative → aria-hidden, no text.
//
// Keyframes ship inline in a <style> tag rather than as Tailwind utilities:
// consumer apps scan only their OWN source for Tailwind classes, so arbitrary
// animation utilities declared here would never be generated in their build.

import * as React from 'react'
import { cn } from '@asteby/metacore-ui/lib'

const STYLE_ID = 'mc-dashboard-empty-mockup-style'

// One slot step = a full cell (100%) plus the grid gap (0.75rem = gap-3).
// The cycle is split into 10 equal windows (10 moves: 5 out, 5 back). Each move
// slides during the first ~3% of its window, then holds — so at every instant
// at most ONE tile is mid-slide. dur 20s → each slide ≈ 0.6s, pauses ≈ 1.4s.
const MOCKUP_CSS = `
.mc-demock{--mc-demock-step:calc(100% + 0.75rem)}
.mc-demock-tile{will-change:transform;
  animation-duration:20s;animation-timing-function:ease-in-out;
  animation-iteration-count:infinite}
.mc-demock-shimmer{position:relative;overflow:hidden}
.mc-demock-shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 35%,currentColor 50%,transparent 65%);
  opacity:.045;transform:translateX(-120%);
  animation:mc-demock-sheen 20s ease-in-out infinite}
/* Gap fills the empty slot only when motion is reduced (static full grid). */
.mc-demock-hole{display:none}
/* Move 1 / 10: tile slides RIGHT into the start gap, back at the very end. */
.mc-demock-m1{animation-name:mc-demock-m1}
@keyframes mc-demock-m1{
  0%{transform:translateX(0)}3%{transform:translateX(var(--mc-demock-step))}
  90%{transform:translateX(var(--mc-demock-step))}93%,100%{transform:translateX(0)}}
/* Move 2 / 9: slides UP, back later. */
.mc-demock-m2{animation-name:mc-demock-m2}
@keyframes mc-demock-m2{
  0%,10%{transform:translateY(0)}13%{transform:translateY(calc(-1 * var(--mc-demock-step)))}
  80%{transform:translateY(calc(-1 * var(--mc-demock-step)))}83%,100%{transform:translateY(0)}}
/* Move 3 / 8: slides RIGHT. */
.mc-demock-m3{animation-name:mc-demock-m3}
@keyframes mc-demock-m3{
  0%,20%{transform:translateX(0)}23%{transform:translateX(var(--mc-demock-step))}
  70%{transform:translateX(var(--mc-demock-step))}73%,100%{transform:translateX(0)}}
/* Move 4 / 7: slides UP. */
.mc-demock-m4{animation-name:mc-demock-m4}
@keyframes mc-demock-m4{
  0%,30%{transform:translateY(0)}33%{transform:translateY(calc(-1 * var(--mc-demock-step)))}
  60%{transform:translateY(calc(-1 * var(--mc-demock-step)))}63%,100%{transform:translateY(0)}}
/* Move 5 / 6: slides RIGHT (the turnaround — shortest hold). */
.mc-demock-m5{animation-name:mc-demock-m5}
@keyframes mc-demock-m5{
  0%,40%{transform:translateX(0)}43%{transform:translateX(var(--mc-demock-step))}
  50%{transform:translateX(var(--mc-demock-step))}53%,100%{transform:translateX(0)}}
@keyframes mc-demock-sheen{0%,100%{transform:translateX(-120%)}55%,72%{transform:translateX(120%)}}
@media (prefers-reduced-motion:reduce){
  .mc-demock-tile{animation:none!important}
  .mc-demock-shimmer::after{animation:none!important;opacity:0}
  .mc-demock-hole{display:flex!important}
}
`

/** Injects the keyframes once per document (idempotent, SSR-safe). */
function useMockupStyles() {
    React.useInsertionEffect(() => {
        if (typeof document === 'undefined') return
        if (document.getElementById(STYLE_ID)) return
        const el = document.createElement('style')
        el.id = STYLE_ID
        el.textContent = MOCKUP_CSS
        document.head.appendChild(el)
    }, [])
}

// The frame mirrors the real WidgetCard chrome (see widgets/widget-card.tsx):
// subtle border, rounded-xl, card background — so the puzzle reads as the actual
// dashboard cards rendering in skeleton form, not generic grey boxes.
const tileBase =
    'rounded-xl border border-border/60 bg-card mc-demock-tile mc-demock-shimmer text-foreground overflow-hidden'

type Glyph = 'chart' | 'stat' | 'list' | 'bar'

// Skeleton header shared by every card kind: an icon chip + title bar + a
// shorter subtitle bar, matching WidgetCard's header anatomy.
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

// Each body copies the anatomy of the matching real renderer (renderers.tsx):
//   stat  → big number block + delta chip
//   chart → row of variable-height bars
//   list  → rows of dot + label bar + value
//   bar   → progress track with a filled portion
function TileGlyph({ kind }: { kind: Glyph }) {
    return (
        <div className="flex h-full flex-col gap-3 p-3">
            <SkeletonHeader />
            <div className="min-h-0 flex-1">
                {kind === 'stat' && (
                    <div className="flex h-full flex-col justify-center gap-2">
                        <div className="h-7 w-1/2 rounded-md bg-foreground/15" />
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

// 4 cols × 3 rows. The gap starts at (col4,row1) → that slot has no puzzle tile
// (only the reduced-motion filler). Each tile declares its HOME cell; the 5
// movers carry a motion class. Static tiles never move.
type Cell = { col: number; row: number; kind: Glyph; motion?: string; hole?: boolean }

const CELLS: Cell[] = [
    // Row 1
    { col: 1, row: 1, kind: 'stat' },
    { col: 2, row: 1, kind: 'chart' },
    { col: 3, row: 1, kind: 'stat', motion: 'mc-demock-m1' }, // slides right into the gap
    { col: 4, row: 1, kind: 'bar', hole: true }, // the gap (filler only under reduced-motion)
    // Row 2
    { col: 1, row: 2, kind: 'list' },
    { col: 2, row: 2, kind: 'stat', motion: 'mc-demock-m3' },
    { col: 3, row: 2, kind: 'bar', motion: 'mc-demock-m2' },
    { col: 4, row: 2, kind: 'chart' },
    // Row 3
    { col: 1, row: 3, kind: 'stat', motion: 'mc-demock-m5' },
    { col: 2, row: 3, kind: 'list', motion: 'mc-demock-m4' },
    { col: 3, row: 3, kind: 'chart' },
    { col: 4, row: 3, kind: 'bar' },
]

/**
 * Full-bleed sliding-tile puzzle of dashboard skeletons. One tile slides one
 * slot at a time into the single gap; tiles never overlap. Purely decorative —
 * always `aria-hidden`, no text.
 */
export function DashboardEmptyMockup({ className }: { className?: string }) {
    useMockupStyles()
    return (
        <div
            aria-hidden="true"
            data-testid="dashboard-empty-mockup"
            className={cn('mc-demock pointer-events-none h-full w-full select-none', className)}
        >
            <div
                className="grid h-full w-full gap-3"
                style={{
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                }}
            >
                {CELLS.map((c, i) => (
                    <div
                        key={i}
                        data-mockup-tile={c.hole ? 'hole' : 'tile'}
                        style={{ gridColumn: c.col, gridRow: c.row }}
                        className={cn(tileBase, c.motion, c.hole && 'mc-demock-hole')}
                    >
                        <TileGlyph kind={c.kind} />
                    </div>
                ))}
            </div>
        </div>
    )
}
