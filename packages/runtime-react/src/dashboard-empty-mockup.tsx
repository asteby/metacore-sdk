// DashboardEmptyMockup — the animated empty state for the modular dashboard.
//
// Instead of a static "nothing here" card, we paint a silhouette of the
// dashboard itself and let it BUILD ITSELF: skeleton tiles (a big chart, stat
// cards, a bar, lists) that live in a full-bleed grid and visibly slide past
// each other, swapping places like pieces reorganizing into a layout. The
// metaphor is "your board is assembling", not "empty".
//
// Design constraints (kept simple so it ships from a package):
//   - Full-bleed: fills the whole dashboard area (100% w/h), NOT a centered
//     illustration. A responsive grid so it reads like the real dashboard.
//   - Pure CSS keyframes, no dependencies. One slow loop (~13s). Motion is
//     PERCEPTIBLE — tiles translate a real distance and swap in pairs — but
//     never opacity-strobing, and eased so it feels like settling.
//   - Theme tokens only (bg-muted / border tokens) → light & dark for free.
//   - `prefers-reduced-motion: reduce` freezes everything (tiles rest in place).
//   - No caption text — the animation carries the meaning, and shipping copy
//     from the package risks un-localized strings. The whole mock is
//     decorative → aria-hidden.
//
// Keyframes ship inline in a <style> tag rather than as Tailwind utilities:
// consumer apps scan only their OWN source for Tailwind classes, so arbitrary
// animation utilities declared here would never be generated in their build.
// Static tokens (bg-muted, rounded-lg…) are standard classes the host emits
// anyway, so those stay as className.

import * as React from 'react'
import { cn } from '@asteby/metacore-ui/lib'

// Scoped, collision-proof keyframe + class names (prefixed, unlikely to clash).
const STYLE_ID = 'mc-dashboard-empty-mockup-style'

// Each tile lives in a grid cell and animates on a shared ~13s loop. Pairs move
// in opposite directions at the same phase so it reads as a SWAP, and the phases
// are staggered (via negative delays) so 2-3 tiles are always in motion at
// different moments of the cycle — never a frozen frame.
const MOCKUP_CSS = `
.mc-demock{--mc-demock-dur:13s}
.mc-demock-tile{will-change:transform;transform-origin:center;
  animation-duration:var(--mc-demock-dur);animation-timing-function:cubic-bezier(.65,0,.35,1);
  animation-iteration-count:infinite}
/* Horizontal swap pair (col A <-> col B) */
.mc-demock-swapL{animation-name:mc-demock-swap-left}
.mc-demock-swapR{animation-name:mc-demock-swap-right;animation-delay:-.2s}
/* Vertical swap pair */
.mc-demock-swapU{animation-name:mc-demock-swap-up;animation-delay:-4.3s}
.mc-demock-swapD{animation-name:mc-demock-swap-down;animation-delay:-4.5s}
/* Diagonal reshuffle pair */
.mc-demock-shuffleA{animation-name:mc-demock-shuffle-a;animation-delay:-8.1s}
.mc-demock-shuffleB{animation-name:mc-demock-shuffle-b;animation-delay:-8.3s}
/* Gentle drifters filling the rhythm between swaps */
.mc-demock-driftA{animation-name:mc-demock-drift-a;animation-delay:-2.4s}
.mc-demock-driftB{animation-name:mc-demock-drift-b;animation-delay:-6.7s}
.mc-demock-shimmer{position:relative;overflow:hidden}
.mc-demock-shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 35%,currentColor 50%,transparent 65%);
  opacity:.05;transform:translateX(-120%);
  animation:mc-demock-sheen var(--mc-demock-dur) ease-in-out infinite}
/* Swaps: hold home -> travel a full cell (+gap) to the partner's slot -> hold
   -> travel back. ~108% of own size clears the tile plus the grid gap. */
@keyframes mc-demock-swap-left{
  0%,12%{transform:translate(0,0)}38%,62%{transform:translate(108%,0)}88%,100%{transform:translate(0,0)}}
@keyframes mc-demock-swap-right{
  0%,12%{transform:translate(0,0)}38%,62%{transform:translate(-108%,0)}88%,100%{transform:translate(0,0)}}
@keyframes mc-demock-swap-up{
  0%,12%{transform:translate(0,0)}38%,62%{transform:translate(0,112%)}88%,100%{transform:translate(0,0)}}
@keyframes mc-demock-swap-down{
  0%,12%{transform:translate(0,0)}38%,62%{transform:translate(0,-112%)}88%,100%{transform:translate(0,0)}}
@keyframes mc-demock-shuffle-a{
  0%,15%{transform:translate(0,0) scale(1)}45%,60%{transform:translate(106%,110%) scale(.96)}90%,100%{transform:translate(0,0) scale(1)}}
@keyframes mc-demock-shuffle-b{
  0%,15%{transform:translate(0,0) scale(1)}45%,60%{transform:translate(-106%,-110%) scale(1.04)}90%,100%{transform:translate(0,0) scale(1)}}
@keyframes mc-demock-drift-a{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(4%,-5%) scale(1.02)}}
@keyframes mc-demock-drift-b{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-5%,4%) scale(.98)}}
@keyframes mc-demock-sheen{0%,100%{transform:translateX(-120%)}55%,72%{transform:translateX(120%)}}
@media (prefers-reduced-motion:reduce){
  .mc-demock-tile{animation:none!important}
  .mc-demock-shimmer::after{animation:none!important;opacity:0}
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

const tileBase =
    'rounded-lg bg-muted mc-demock-tile mc-demock-shimmer text-foreground overflow-hidden'

/** A skeleton "chart" tile: a row of bars. */
function ChartGlyph() {
    return (
        <div className="flex h-full items-end gap-1.5 p-3">
            {[6, 10, 7, 12, 9, 11, 8].map((h, i) => (
                <div
                    key={i}
                    className="w-full rounded-sm bg-foreground/10"
                    style={{ height: `${h * 8}%` }}
                />
            ))}
        </div>
    )
}

/** A skeleton "stat card": label + big number. */
function StatGlyph() {
    return (
        <div className="flex h-full flex-col justify-center gap-2 p-3">
            <div className="h-2 w-1/2 rounded-full bg-foreground/15" />
            <div className="h-4 w-2/3 rounded bg-foreground/15" />
        </div>
    )
}

/** A skeleton "list" tile: stacked rows. */
function ListGlyph() {
    return (
        <div className="flex h-full flex-col justify-center gap-2 p-3">
            <div className="h-2 w-full rounded-full bg-foreground/12" />
            <div className="h-2 w-4/5 rounded-full bg-foreground/12" />
            <div className="h-2 w-2/3 rounded-full bg-foreground/12" />
        </div>
    )
}

/** A skeleton "progress bar" tile. */
function BarGlyph() {
    return (
        <div className="flex h-full items-center px-3">
            <div className="h-2.5 w-full rounded-full bg-foreground/10">
                <div className="h-full w-2/5 rounded-full bg-foreground/20" />
            </div>
        </div>
    )
}

// The board: a 4-col x 4-row grid that fills the container. Each tile declares
// its cell (via inline gridColumn/gridRow) and a motion class. Swap pairs sit in
// adjacent cells and move toward each other, so the eye reads a reshuffle.
type Tile = { area: React.CSSProperties; motion: string; glyph: React.ReactNode }

const TILES: Tile[] = [
    // Big chart (top-left 2x2) — diagonal shuffle with the bottom stat.
    { area: { gridColumn: '1 / 3', gridRow: '1 / 3' }, motion: 'mc-demock-shuffleA', glyph: <ChartGlyph /> },
    // Horizontal swap pair, top-right.
    { area: { gridColumn: '3 / 4', gridRow: '1 / 2' }, motion: 'mc-demock-swapL', glyph: <StatGlyph /> },
    { area: { gridColumn: '4 / 5', gridRow: '1 / 2' }, motion: 'mc-demock-swapR', glyph: <StatGlyph /> },
    // Vertical swap pair, right column.
    { area: { gridColumn: '3 / 5', gridRow: '2 / 3' }, motion: 'mc-demock-swapU', glyph: <ListGlyph /> },
    { area: { gridColumn: '3 / 5', gridRow: '3 / 4' }, motion: 'mc-demock-swapD', glyph: <BarGlyph /> },
    // Bottom-left cluster: shuffle partner + drifter.
    { area: { gridColumn: '1 / 2', gridRow: '3 / 4' }, motion: 'mc-demock-shuffleB', glyph: <StatGlyph /> },
    { area: { gridColumn: '2 / 3', gridRow: '3 / 4' }, motion: 'mc-demock-driftA', glyph: <StatGlyph /> },
    // Full-width footer bar + trailing stat.
    { area: { gridColumn: '1 / 4', gridRow: '4 / 5' }, motion: 'mc-demock-driftB', glyph: <BarGlyph /> },
    { area: { gridColumn: '4 / 5', gridRow: '4 / 5' }, motion: 'mc-demock-driftA', glyph: <StatGlyph /> },
]

/**
 * Full-bleed animated skeleton of a dashboard whose tiles slide and swap places,
 * as if the layout were assembling itself. Purely decorative — always
 * `aria-hidden`, no text.
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
                    gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
                }}
            >
                {TILES.map((t, i) => (
                    <div key={i} style={t.area} className={cn(tileBase, t.motion)}>
                        {t.glyph}
                    </div>
                ))}
            </div>
        </div>
    )
}
