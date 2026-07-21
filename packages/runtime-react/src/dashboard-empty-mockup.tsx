// DashboardEmptyMockup — the animated empty state for the modular dashboard.
//
// Instead of a static "nothing here" card, we paint a silhouette of the
// dashboard itself: skeleton tiles (a big chart, a couple of stat cards, a
// bar, a list) that slowly drift and swap places, like puzzle pieces settling
// into a layout. The metaphor is "your board is getting ready", not "empty".
//
// Design constraints (kept deliberately simple so it ships from a package):
//   - Pure CSS keyframes, no dependencies. One slow ~11s loop, subtle motion
//     (small translate + scale, never opacity strobing).
//   - Theme tokens only (bg-muted / border tokens) → light & dark for free.
//   - `prefers-reduced-motion: reduce` freezes everything (tiles rest in place).
//   - The whole mock is decorative → aria-hidden; the copy below carries the
//     accessible meaning.
//
// The keyframes ship inline in a <style> tag rather than as Tailwind utilities:
// consumer apps scan only their OWN source for Tailwind classes, so arbitrary
// animation utilities declared here would never be generated in their build.
// Static tokens (bg-muted, rounded-lg…) are standard classes the host emits
// anyway, so those stay as className.

import * as React from 'react'
import { cn } from '@asteby/metacore-ui/lib'

// Scoped, collision-proof keyframe + class names (prefixed, unlikely to clash).
const STYLE_ID = 'mc-dashboard-empty-mockup-style'

const MOCKUP_CSS = `
.mc-demock{--mc-demock-dur:11s}
.mc-demock-tile{will-change:transform;transform-origin:center;
  animation-duration:var(--mc-demock-dur);animation-timing-function:cubic-bezier(.65,0,.35,1);
  animation-iteration-count:infinite}
.mc-demock-t1{animation-name:mc-demock-drift-a}
.mc-demock-t2{animation-name:mc-demock-drift-b;animation-delay:-1.4s}
.mc-demock-t3{animation-name:mc-demock-drift-c;animation-delay:-3.1s}
.mc-demock-t4{animation-name:mc-demock-drift-d;animation-delay:-2.2s}
.mc-demock-t5{animation-name:mc-demock-drift-e;animation-delay:-4.6s}
.mc-demock-shimmer{position:relative;overflow:hidden}
.mc-demock-shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 30%,currentColor 50%,transparent 70%);
  opacity:.05;transform:translateX(-100%);
  animation:mc-demock-sheen var(--mc-demock-dur) ease-in-out infinite}
@keyframes mc-demock-drift-a{0%,100%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(3%,4%,0) scale(1.015)}}
@keyframes mc-demock-drift-b{0%,100%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(-4%,-3%,0) scale(.985)}}
@keyframes mc-demock-drift-c{0%,100%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(5%,-2%,0) scale(1.02)}}
@keyframes mc-demock-drift-d{0%,100%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(-3%,3%,0) scale(.99)}}
@keyframes mc-demock-drift-e{0%,100%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(2%,-4%,0) scale(1.01)}}
@keyframes mc-demock-sheen{0%,100%{transform:translateX(-120%)}55%,70%{transform:translateX(120%)}}
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

const tile = 'rounded-lg bg-muted mc-demock-tile mc-demock-shimmer text-foreground'

/**
 * Animated skeleton of a dashboard (chart + stats + bar + list) whose tiles
 * slowly drift and settle. Purely decorative — always `aria-hidden`.
 */
export function DashboardEmptyMockup({ className }: { className?: string }) {
    useMockupStyles()
    return (
        <div
            aria-hidden="true"
            data-testid="dashboard-empty-mockup"
            className={cn('mc-demock pointer-events-none w-full max-w-md select-none', className)}
        >
            <div className="grid grid-cols-3 grid-rows-[repeat(3,minmax(0,1fr))] gap-3 [aspect-ratio:16/11]">
                {/* Big chart tile */}
                <div className={cn(tile, 'mc-demock-t1 col-span-2 row-span-2 flex flex-col justify-end gap-2 p-3')}>
                    <div className="flex items-end gap-1.5">
                        <div className="h-6 w-full rounded-sm bg-foreground/10" />
                        <div className="h-10 w-full rounded-sm bg-foreground/10" />
                        <div className="h-7 w-full rounded-sm bg-foreground/10" />
                        <div className="h-12 w-full rounded-sm bg-foreground/10" />
                        <div className="h-9 w-full rounded-sm bg-foreground/10" />
                    </div>
                </div>
                {/* Stat card */}
                <div className={cn(tile, 'mc-demock-t2 flex flex-col justify-center gap-2 p-3')}>
                    <div className="h-2 w-1/2 rounded-full bg-foreground/15" />
                    <div className="h-4 w-2/3 rounded bg-foreground/15" />
                </div>
                {/* Stat card */}
                <div className={cn(tile, 'mc-demock-t3 flex flex-col justify-center gap-2 p-3')}>
                    <div className="h-2 w-1/2 rounded-full bg-foreground/15" />
                    <div className="h-4 w-1/2 rounded bg-foreground/15" />
                </div>
                {/* List tile */}
                <div className={cn(tile, 'mc-demock-t4 flex flex-col justify-center gap-2 p-3')}>
                    <div className="h-2 w-full rounded-full bg-foreground/12" />
                    <div className="h-2 w-4/5 rounded-full bg-foreground/12" />
                    <div className="h-2 w-2/3 rounded-full bg-foreground/12" />
                </div>
                {/* Progress bar tile */}
                <div className={cn(tile, 'mc-demock-t5 col-span-2 flex items-center px-3')}>
                    <div className="h-2.5 w-full rounded-full bg-foreground/10">
                        <div className="h-full w-2/5 rounded-full bg-foreground/20" />
                    </div>
                </div>
            </div>
        </div>
    )
}
