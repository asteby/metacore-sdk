// IconPickerField — the `icon` widget renderer for DynamicForm. Two modes:
//
//   - "Ícono" (default): search box + grid of lucide glyphs filtered by name.
//     Clicking one stores the PascalCase lucide name ("CreditCard") as the
//     field value — the same convention OptionDef.icon and image-ish cell
//     renderers already understand (see dynamic-icon.tsx).
//   - "Imagen": delegates to the existing UploadField untouched, so the value
//     is the uploaded file url/path exactly as the `upload` widget stores it.
//
// The stored value stays a plain string (retrocompatible): a lucide name when
// an icon was picked, a url/path when an image was uploaded. When editing, the
// initial mode is inferred from the current value — path-like ("/" or ".")
// means image, anything else means icon.
import { useMemo, useState } from 'react'
import { icons } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui/primitives'
import { DynamicIcon, resolveLucideIconName } from './dynamic-icon'
import { UploadField } from './upload-field'
import type { ActionFieldDef } from './types'

export interface IconPickerFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
}

/** Max glyphs shown in the grid at once — keeps the DOM light while searching. */
const MAX_RESULTS = 48

const ALL_ICON_NAMES = Object.keys(icons)

/** True when a stored value looks like an image url/path rather than an icon name. */
export function looksLikeImageValue(value: unknown): boolean {
    return typeof value === 'string' && value !== '' && /[/.]/.test(value)
}

export function IconPickerField({ field, value, onChange }: IconPickerFieldProps) {
    const [mode, setMode] = useState<'icon' | 'image'>(() =>
        looksLikeImageValue(value) ? 'image' : 'icon',
    )
    const [query, setQuery] = useState('')

    const selected = mode === 'icon' ? resolveLucideIconName(value) : null

    const results = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/[\s_-]/g, '')
        const names = q
            ? ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q))
            : ALL_ICON_NAMES
        // Keep the current selection visible even when it doesn't match the query.
        if (selected && !names.slice(0, MAX_RESULTS).includes(selected)) {
            return [selected, ...names.filter((n) => n !== selected)].slice(0, MAX_RESULTS)
        }
        return names.slice(0, MAX_RESULTS)
    }, [query, selected])

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Tipo de ícono">
                <Button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'icon'}
                    variant={mode === 'icon' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setMode('icon')}
                >
                    Ícono
                </Button>
                <Button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'image'}
                    variant={mode === 'image' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setMode('image')}
                >
                    Imagen
                </Button>
            </div>
            {mode === 'image' ? (
                <UploadField field={field} value={value} onChange={onChange} />
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <Input
                            id={field.key}
                            value={query}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                            placeholder="Buscar ícono..."
                            aria-label="Buscar ícono"
                        />
                        {selected && (
                            <div
                                data-testid="icon-picker-preview"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted"
                                title={selected}
                            >
                                <DynamicIcon name={selected} className="h-6 w-6" />
                            </div>
                        )}
                    </div>
                    <div
                        className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2"
                        role="listbox"
                        aria-label="Íconos"
                    >
                        {results.map((name) => (
                            <button
                                key={name}
                                type="button"
                                role="option"
                                aria-selected={name === selected}
                                aria-label={name}
                                title={name}
                                onClick={() => onChange(name)}
                                className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent ${
                                    name === selected ? 'bg-accent ring-1 ring-primary' : ''
                                }`}
                            >
                                <DynamicIcon name={name} className="h-4 w-4" />
                            </button>
                        ))}
                        {results.length === 0 && (
                            <span className="col-span-8 py-4 text-center text-sm text-muted-foreground">
                                Sin resultados
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
