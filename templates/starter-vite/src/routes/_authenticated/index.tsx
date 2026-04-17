import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '@asteby/metacore-auth/store'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})

function DashboardPage() {
  const user = useAuthStore((s) => s.auth.user)
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome{user?.name ? `, ${user.name}` : ''}. This is a placeholder — replace with your own widgets.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Runtime" body="runtime-react renders DynamicTable, DynamicForm, action modals." />
        <Card title="Auth" body="Login/Signup/Guards come from @asteby/metacore-auth." />
        <Card title="PWA" body="Install prompts, offline indicator, push — from @asteby/metacore-pwa." />
      </section>
    </div>
  )
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
