// Developer-marketplace showcase. Pitch: "build, sign, ship addons that any
// metacore host can install in one click." Renders a hero card with a
// rotating set of addon tiles to convey breadth of the catalog without
// hardcoding any specific addon names.
import { motion } from 'framer-motion'
import {
  Boxes,
  Plug,
  ShieldCheck,
  Zap,
  Bot,
  Rocket,
  Sparkles,
  Globe,
} from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'

export type MarketplaceShowcaseProps = {
  /** Headline displayed above the addon grid. */
  title?: string
  /** Subheadline explaining what the marketplace is. */
  subtitle?: string
  /** Override the bottom-bar tagline. */
  tagline?: string
}

const addons: Array<{ name: string; tag: string; Icon: typeof Bot }> = [
  { name: 'Fiscal MX', tag: 'Compliance', Icon: ShieldCheck },
  { name: 'WhatsApp', tag: 'Messaging', Icon: Bot },
  { name: 'Stripe', tag: 'Payments', Icon: Zap },
  { name: 'Shopify', tag: 'Ecommerce', Icon: Boxes },
  { name: 'Notion', tag: 'Productivity', Icon: Sparkles },
  { name: 'Webhook', tag: 'Integrations', Icon: Plug },
  { name: 'Telegram', tag: 'Messaging', Icon: Globe },
  { name: 'GitHub', tag: 'DevTools', Icon: Rocket },
  { name: 'Resend', tag: 'Email', Icon: Bot },
]

export function MarketplaceShowcase({
  title = 'El marketplace de addons',
  subtitle = 'Construye, firma y publica integraciones que cualquier host metacore puede instalar en un click.',
  tagline = 'Bundles firmados · Sandbox WASM · Multi-tenant',
}: MarketplaceShowcaseProps = {}) {
  return (
    <div className="relative w-full max-w-md px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl font-bold tracking-tight mb-3">{title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{subtitle}</p>
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        {addons.map((addon, i) => {
          const { Icon } = addon
          return (
            <motion.div
              key={addon.name}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.35 }}
              className={cn(
                'group relative rounded-xl border bg-card p-3 shadow-sm',
                'hover:shadow-md hover:border-primary/30 transition-all',
              )}
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="size-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs font-semibold leading-tight">{addon.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{addon.tag}</div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <ShieldCheck className="size-3.5" />
        <span>{tagline}</span>
      </motion.div>
    </div>
  )
}
