// Editor de un campo JSON del formulario dinámico (ver json-field-model.ts): Textarea monoespaciado con el JSON con sangría.
import { useEffect, useRef, useState } from 'react'
import { Textarea } from '@asteby/metacore-ui/primitives'
import type { ActionFieldDef } from './types'
import { formatJsonValue, parseJsonInput } from './json-field-model'

export function JsonField({
  field,
  value,
  onChange,
  invalid,
}: {
  field: ActionFieldDef
  value: unknown
  onChange: (next: unknown) => void
  invalid?: boolean
}) {
  const [text, setText] = useState(() => formatJsonValue(value))
  // Lo último que este campo mismo empujó al formulario: si `value` cambia por otra vía (reinicio, carga del registro), se resincroniza.
  const pushed = useRef<unknown>(value)
  useEffect(() => {
    if (Object.is(value, pushed.current)) return
    pushed.current = value
    setText(formatJsonValue(value))
  }, [value])

  return (
    <Textarea
      id={field.key}
      data-widget="json"
      spellCheck={false}
      rows={Math.min(Math.max(text.split('\n').length, 3), 14)}
      className="font-mono text-xs"
      aria-invalid={invalid || undefined}
      value={text}
      placeholder={field.placeholder ?? '{ }'}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const raw = e.target.value
        setText(raw)
        const parsed = parseJsonInput(raw)
        const next = parsed.ok ? parsed.value : parsed.raw
        pushed.current = next
        onChange(next)
      }}
    />
  )
}
