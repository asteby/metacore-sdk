import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        // Soft tonal states for status chips: a tint of the theme's status
        // token (--success / --warning / --info / --destructive, see
        // @asteby/metacore-theme tokens.css) so a theme pack recolors them;
        // the oklch fallbacks cover apps that don't define the token yet.
        success:
          'border-[color-mix(in_oklab,var(--success,oklch(0.6_0.15_155))_30%,transparent)] bg-[color-mix(in_oklab,var(--success,oklch(0.6_0.15_155))_14%,transparent)] text-[var(--success,oklch(0.6_0.15_155))]',
        warning:
          'border-[color-mix(in_oklab,var(--warning,oklch(0.68_0.16_70))_30%,transparent)] bg-[color-mix(in_oklab,var(--warning,oklch(0.68_0.16_70))_14%,transparent)] text-[var(--warning,oklch(0.6_0.15_65))]',
        danger:
          'border-[color-mix(in_oklab,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-destructive',
        info: 'border-[color-mix(in_oklab,var(--info,oklch(0.62_0.13_235))_30%,transparent)] bg-[color-mix(in_oklab,var(--info,oklch(0.62_0.13_235))_14%,transparent)] text-[var(--info,oklch(0.55_0.13_235))]',
        muted: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot='badge'
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
