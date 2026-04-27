import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Package,
  Contact,
  Bell,
  Store,
  Sparkles,
  GitMerge,
  Server,
  Layers,
  ArrowUpRight,
} from 'lucide-react'
import { useAuthStore } from '@asteby/metacore-auth/store'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})

function DashboardPage() {
  const user = useAuthStore((s) => s.auth.user) as any
  const firstName = user?.name?.split(' ')[0] ?? 'tú'

  return (
    <div className='p-6 lg:p-10 space-y-10 max-w-6xl mx-auto'>
      {/* Hero */}
      <header className='flex items-start gap-4'>
        <img src='/images/logo.svg' alt='Metacore' className='size-12 shrink-0 mt-1' />
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            Hola, {firstName}.
          </h1>
          <p className='text-muted-foreground mt-1 max-w-2xl'>
            Tu plataforma <span className='font-medium text-foreground'>Metacore</span> está corriendo. Backend Go con kernel, frontend React con SDK, y todo se mantiene al día solo.
          </p>
        </div>
      </header>

      {/* Singularity callout */}
      <section className='relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 lg:p-8'>
        <div className='absolute -top-20 -right-20 size-64 rounded-full bg-primary/10 blur-3xl' />
        <div className='relative flex flex-col lg:flex-row lg:items-center gap-6'>
          <div className='flex-1'>
            <div className='inline-flex items-center gap-2 text-primary text-sm font-medium mb-2'>
              <Sparkles className='size-4' />
              Modelo singularity
            </div>
            <h2 className='text-xl lg:text-2xl font-semibold tracking-tight'>
              El platform team publica, tu app hereda — sola.
            </h2>
            <p className='text-muted-foreground text-sm mt-2 max-w-xl'>
              Cada release de <code className='px-1 py-0.5 rounded bg-muted text-xs'>metacore-kernel</code> y <code className='px-1 py-0.5 rounded bg-muted text-xs'>@asteby/metacore-*</code> baja por Renovate y se mergea automáticamente. Tú escribes producto; la plataforma se mueve sola.
            </p>
          </div>
          <div className='flex flex-col gap-2 text-sm'>
            <Stat icon={Server} label='Backend' value='~50 LOC Go' />
            <Stat icon={Layers} label='Frontend' value='~500 LOC React' />
            <Stat icon={GitMerge} label='Auto-merge' value='Activo' />
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section>
        <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
          Empieza por aquí
        </h3>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <ModuleCard to='/m/products' icon={Package} title='Productos' desc='CRUD dinámico generado por metadatos' />
          <ModuleCard to='/m/customers' icon={Contact} title='Clientes' desc='Tablas y formularios de la SDK' />
          <ModuleCard to='/m/notifications' icon={Bell} title='Notificaciones' desc='Push en tiempo real vía WebSocket' />
          <ModuleCard to='/marketplace' icon={Store} title='Marketplace' desc='Instala addons desde el Hub' />
        </div>
      </section>

      <footer className='pt-4 border-t text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1'>
        <span>Powered by Metacore Starter Kit</span>
        <span>·</span>
        <a className='hover:text-foreground' href='https://github.com/asteby/metacore-sdk' target='_blank' rel='noopener noreferrer'>SDK</a>
        <span>·</span>
        <a className='hover:text-foreground' href='https://github.com/asteby/metacore-kernel' target='_blank' rel='noopener noreferrer'>Kernel</a>
      </footer>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className='flex items-center gap-3 px-3 py-2 rounded-lg bg-background/60 border border-border/50'>
      <Icon className='size-4 text-primary shrink-0' />
      <div className='flex flex-col leading-tight'>
        <span className='text-[10px] uppercase tracking-wider text-muted-foreground'>{label}</span>
        <span className='font-medium'>{value}</span>
      </div>
    </div>
  )
}

function ModuleCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string
  icon: any
  title: string
  desc: string
}) {
  return (
    <Link
      to={to}
      className='group rounded-xl border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-2'
    >
      <div className='flex items-center justify-between'>
        <div className='size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center'>
          <Icon className='size-4' />
        </div>
        <ArrowUpRight className='size-4 text-muted-foreground group-hover:text-primary transition-colors' />
      </div>
      <div>
        <h4 className='font-medium'>{title}</h4>
        <p className='text-xs text-muted-foreground mt-0.5 leading-snug'>{desc}</p>
      </div>
    </Link>
  )
}
