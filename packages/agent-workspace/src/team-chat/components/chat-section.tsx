import type { ReactNode } from 'react'
import { useId } from 'react'
import { Button } from '@asteby/metacore-ui'
import { resolveIcon } from '../../host'
import type { TeamChatSection, TeamChatSectionAction } from '../data/types'

/**
 * A pinned section of the conversation list: heading, optional hint, actions and the
 * conversations grouped under it. Fully driven by the server descriptor (texts, icons,
 * hrefs); an action with an `href` is a link, otherwise it calls `onAction` (and is
 * omitted when the host gave no handler, so nothing renders dead).
 */
export function ChatSection({
  section,
  onAction,
  children,
}: {
  section: TeamChatSection
  onAction?: (sectionKey: string, actionId: string) => void
  children?: ReactNode
}) {
  const uid = useId()
  const headingId = `${uid}-h`
  const hintId = section.hint ? `${uid}-hint` : undefined
  const actions = (section.actions ?? []).filter((a) => a.href || onAction)
  return (
    <section aria-labelledby={headingId} aria-describedby={hintId} data-testid={`chat-section-${section.key}`} className='mb-2'>
      <div className='flex items-center justify-between gap-2 px-2.5 pt-1'>
        <h3 id={headingId} className='truncate text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
          {section.title}
        </h3>
        {actions.length > 0 && (
          <div className='flex shrink-0 items-center gap-0.5'>
            {actions.map((a) => (
              <SectionAction key={a.id} action={a} onClick={() => onAction?.(section.key, a.id)} />
            ))}
          </div>
        )}
      </div>
      {section.hint ? (
        <p id={hintId} className='px-2.5 pb-1 text-xs text-muted-foreground'>
          {section.hint}
        </p>
      ) : null}
      {children}
    </section>
  )
}

function SectionAction({ action, onClick }: { action: TeamChatSectionAction; onClick: () => void }) {
  const Icon = action.icon ? resolveIcon(action.icon) : null
  const content = (
    <>
      {Icon ? <Icon className='size-3.5' aria-hidden /> : null}
      {action.label}
    </>
  )
  if (action.href) {
    return (
      <Button asChild variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'>
        <a href={action.href}>{content}</a>
      </Button>
    )
  }
  return (
    <Button type='button' variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs' onClick={onClick}>
      {content}
    </Button>
  )
}
