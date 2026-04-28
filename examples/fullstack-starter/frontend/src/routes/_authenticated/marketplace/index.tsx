import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, Store, Loader2 } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_authenticated/marketplace/')({
  component: MarketplacePage,
})

// Configure the marketplace/hub URL via the VITE_HUB_URL env var. Defaults
// to the official Metacore Hub at hub.asteby.com so the route works
// out of the box; teams running their own hub override via env.
const HUB_URL = import.meta.env.VITE_HUB_URL ?? 'https://hub.asteby.com'

// Builds an embed-aware URL: tells the Hub it's framed, syncs theme + lang
// so the marketplace inherits the host's appearance instead of fighting it.
function buildEmbedUrl(language: string): string {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const params = new URLSearchParams({ embed: '1', theme, lang: language })
  const sep = HUB_URL.includes('?') ? '&' : '?'
  return `${HUB_URL}${sep}${params.toString()}`
}

function MarketplacePage() {
  const { i18n } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const src = buildEmbedUrl(i18n.language || 'es')

  // Theme/lang are baked into the URL — when either changes after mount,
  // remount the iframe so the next paint inherits the new values.
  useEffect(() => {
    setLoaded(false)
  }, [src])

  return (
    <div data-layout='fixed' className='flex flex-col h-full overflow-hidden bg-background'>
      <div className='flex items-center justify-between px-6 py-3 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          <Store className='h-5 w-5 text-primary' />
          <h1 className='text-base font-semibold tracking-tight'>Marketplace</h1>
        </div>
        <Button variant='ghost' size='sm' asChild className='gap-1.5 text-muted-foreground hover:text-foreground'>
          <a href={HUB_URL} target='_blank' rel='noopener noreferrer'>
            Abrir en pestaña nueva
            <ExternalLink className='h-3.5 w-3.5' />
          </a>
        </Button>
      </div>
      <div className='relative flex-1 min-h-0'>
        {!loaded && (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm'>
            <Loader2 className='h-6 w-6 animate-spin text-primary' />
            <p className='text-sm text-muted-foreground'>Cargando Hub…</p>
          </div>
        )}
        <iframe
          key={src}
          src={src}
          className='absolute inset-0 w-full h-full border-0'
          title='Metacore Hub Marketplace'
          allow='clipboard-read; clipboard-write'
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  )
}
