// Brand-neutral fallback showcase for apps that don't have a custom one yet.
// A simple animated gradient blob with a tagline — enough to keep the auth
// page from looking empty without forcing any product narrative.
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export type GenericShowcaseProps = {
  /** Headline. Apps usually pass their brand name + a one-liner. */
  title?: string
  /** Subhead under the title. */
  subtitle?: string
  /** Optional slot rendered below the subtitle (CTAs, badges, signed-by, …). */
  footer?: ReactNode
}

export function GenericShowcase({
  title = 'Bienvenido',
  subtitle = 'Inicia sesión para continuar.',
  footer,
}: GenericShowcaseProps = {}) {
  return (
    <div className="relative w-full h-full flex items-center justify-center px-8 overflow-hidden">
      <div className="pointer-events-none absolute -top-1/4 -right-1/4 size-[480px] rounded-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -bottom-1/4 -left-1/4 size-[420px] rounded-full bg-gradient-to-tr from-primary/20 to-transparent blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-center max-w-sm"
      >
        <h1 className="text-3xl font-bold tracking-tight mb-3">{title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{subtitle}</p>
        {footer && <div className="mt-6">{footer}</div>}
      </motion.div>
    </div>
  )
}
