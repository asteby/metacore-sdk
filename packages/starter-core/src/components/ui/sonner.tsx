import { Toaster as MetacoreToaster } from '@asteby/metacore-ui/primitives'
import type { ComponentProps } from 'react'
import { useTheme } from '../../context/theme-provider'

type ToasterProps = ComponentProps<typeof MetacoreToaster>

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme()

  return <MetacoreToaster theme={theme as ToasterProps['theme']} {...props} />
}
