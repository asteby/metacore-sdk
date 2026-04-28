import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, Store } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'

export const Route = createFileRoute('/_authenticated/marketplace/')({
  component: MarketplacePage,
})

// Configure the marketplace/hub URL via the VITE_HUB_URL env var. Defaults
// to the official Metacore Hub at hub.asteby.com so the route works
// out of the box; teams running their own hub override via env.
const HUB_URL = import.meta.env.VITE_HUB_URL ?? 'https://hub.asteby.com'

function MarketplacePage() {
  return (
    <div data-layout='fixed' className='flex flex-col h-full overflow-hidden'>
      <div className='flex items-center justify-between p-6 border-b'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            <Store className='h-6 w-6 text-primary' />
            Marketplace
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Instala addons y extensiones desde tu Hub de Metacore
          </p>
        </div>
        <Button variant='outline' asChild>
          <a href={HUB_URL} target='_blank' rel='noopener noreferrer' className='gap-2'>
            Abrir Hub
            <ExternalLink className='h-4 w-4' />
          </a>
        </Button>
      </div>
      <iframe
        src={HUB_URL}
        className='flex-1 w-full border-0'
        title='Metacore Hub Marketplace'
        allow='clipboard-read; clipboard-write'
      />
    </div>
  )
}
