import type { ReactNode } from 'react'
import { UI_THEME_PACKS, type UIThemeKey, type UIThemePack } from './ui-theme.js'

export interface UiThemePickerProps {
    /** Selected pack key. */
    value: UIThemeKey
    /** Fires with the pack so the host can also adopt its default font/density. */
    onChange: (key: UIThemeKey, pack: UIThemePack) => void
    /** Pack to flag as "recommended" (e.g. from a vertical preset). */
    recommended?: UIThemeKey
    /** Accent for the mini preview; defaults to the pack's own swatch. */
    color?: string
    /** Limit/reorder the packs offered. Defaults to all. */
    packs?: UIThemePack[]
    labels?: { recommended?: string }
    className?: string
}

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

/** Mini app chrome (sidebar + content) that previews a pack's surfaces. */
export function UiThemePreview({ theme, color }: { theme: UIThemeKey; color?: string }): ReactNode {
    return (
        <div
            data-ui-theme-preview={theme}
            className={cx(
                'overflow-hidden rounded-xl border border-border/60 shadow-md',
                theme === 'glass' && 'border-white/30 bg-white/25 shadow-lg backdrop-blur-xl',
                theme === 'sharp' && 'rounded-md',
                theme === 'soft' && 'rounded-2xl',
            )}
            style={color ? ({ ['--preview-primary']: color } as React.CSSProperties) : undefined}
        >
            <div className="flex h-24">
                <div className={cx('flex w-[34%] flex-col gap-1 border-r border-border/50 p-2', theme === 'glass' ? 'bg-white/20 backdrop-blur-md' : 'bg-muted/40')}>
                    <div className="mb-1 h-1.5 w-10 rounded-full bg-foreground/20" />
                    <div className="h-2 rounded" style={{ background: 'var(--preview-primary, var(--primary))' }} />
                    <div className="h-2 rounded bg-foreground/10" />
                    <div className="h-2 rounded bg-foreground/10" />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                    <div className="h-2 w-1/2 rounded bg-foreground/10" />
                    <div className="h-10 rounded-lg border border-border/40 bg-card" />
                </div>
            </div>
        </div>
    )
}

/**
 * Card grid to pick a UI theme pack. Pure presentation: the host decides what
 * to do on change (usually `applyUiTheme` / `paintLiveDesign` + persist).
 */
export function UiThemePicker({ value, onChange, recommended, color, packs = UI_THEME_PACKS, labels, className }: UiThemePickerProps) {
    return (
        <div role="radiogroup" aria-label="UI theme" className={cx('grid gap-2 sm:grid-cols-2', className)}>
            {packs.map((p) => {
                const active = value === p.key
                return (
                    <button
                        key={p.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(p.key, p)}
                        className={cx(
                            'relative rounded-xl border p-3 text-left transition',
                            active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 hover:border-border hover:bg-muted/30',
                        )}
                    >
                        {recommended === p.key ? (
                            <span className="absolute right-2 top-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                                {labels?.recommended ?? 'Rec.'}
                            </span>
                        ) : null}
                        <div className="mb-2 flex gap-1">
                            {p.swatches.map((c) => (
                                <span key={c} className="size-2.5 rounded-full border border-black/10" style={{ background: c }} aria-hidden />
                            ))}
                        </div>
                        <span className="text-sm font-semibold">{p.name}</span>
                        <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                        {active ? <UiThemePreviewSlot theme={p.key} color={color} /> : null}
                    </button>
                )
            })}
        </div>
    )
}

function UiThemePreviewSlot({ theme, color }: { theme: UIThemeKey; color?: string }) {
    return (
        <div className="mt-2">
            <UiThemePreview theme={theme} color={color} />
        </div>
    )
}
