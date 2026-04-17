import * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

type MetacoreToasterProps = ToasterProps & {
  /**
   * Theme override. Defaults to 'system'. The consumer is expected to wire their
   * own theme provider and pass the resolved theme (`'light' | 'dark' | 'system'`).
   */
  theme?: ToasterProps['theme']
}

export function Toaster({ theme = 'system', ...props }: MetacoreToasterProps) {
  return (
    <Sonner
      theme={theme}
      className='toaster group [&_div[data-content]]:w-full'
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border bg-background shadow-lg',
          title: 'font-semibold',
          description: 'text-sm text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
