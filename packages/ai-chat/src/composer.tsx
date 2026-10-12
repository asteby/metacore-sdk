import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { AGENT_CAPSULE, AGENT_FOCUS } from './surfaces'
import { useCopilot } from './context'

const TOUCH = 'inline-flex min-h-11 min-w-11 items-center justify-center'
const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

/** Capsule composer shared by the AI chat and the channel thread. */
export function Composer({
  onSend,
  busy,
  online = true,
}: {
  onSend: (text: string) => void
  busy?: boolean
  online?: boolean
}) {
  const { labels } = useCopilot()
  const [draft, setDraft] = useState('')
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!online || busy || !draft.trim()) return
    const text = draft
    setDraft('')
    onSend(text)
  }
  return (
    <form onSubmit={submit} className={cx(AGENT_CAPSULE, 'm-3 flex items-end gap-2 p-2')}>
      <textarea
        aria-label={labels.placeholder}
        className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        placeholder={labels.placeholder}
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
        }}
      />
      <button
        type="submit"
        aria-label={labels.send}
        disabled={!draft.trim() || busy || !online}
        className={cx(TOUCH, 'rounded-full bg-primary text-primary-foreground disabled:opacity-50', AGENT_FOCUS)}
      >
        <Send className="size-4" aria-hidden />
      </button>
    </form>
  )
}
