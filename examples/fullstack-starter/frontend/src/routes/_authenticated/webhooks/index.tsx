import { createFileRoute } from '@tanstack/react-router'
import { WebhooksManager } from '@asteby/metacore-webhooks'
import type { WebhooksManagerProps } from '@asteby/metacore-webhooks'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/webhooks/')({
  component: WebhooksPage,
})

function WebhooksPage() {
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-muted-foreground">Configure outgoing webhooks for your organization events.</p>
      </header>
      <WebhooksManager scope="organization" apiClient={api as unknown as WebhooksManagerProps['apiClient']} apiBasePath="/webhooks" />
    </div>
  )
}
