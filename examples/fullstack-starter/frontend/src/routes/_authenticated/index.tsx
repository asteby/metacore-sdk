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
          Welcome{user?.name ? `, ${user.name}` : ''}. Your fullstack metacore app is running.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Backend" body="~50 LOC Go — host.NewApp() boots auth, metadata, dynamic CRUD, push & webhooks." />
        <Card title="Frontend" body="~500 LOC React — all routes render components from @asteby/metacore-* packages." />
        <Card title="11 Packages" body="auth, ui, theme, runtime-react, pwa, webhooks, websocket, notifications, i18n, lib, sdk." />
        <Card title="Apple-like DX" body="One import for theming, one call for the backend, and every page is < 20 LOC." />
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
