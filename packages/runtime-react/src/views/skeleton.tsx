// Fixed-height placeholder shared by the registry and the lazy renderers.

/** Fixed-height skeleton (no layout shift while a renderer chunk loads). */
export function ViewSkeleton({ height = 360 }: { height?: number }) {
    return (
        <div
            aria-busy="true"
            data-testid="view-skeleton"
            className="w-full animate-pulse rounded-lg bg-muted"
            style={{ height }}
        />
    )
}
