import { useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'

const formSchema = z.object({
  email: z
    .string()
    .min(1, 'Por favor, ingresa tu correo electrónico')
    .email('Correo electrónico inválido'),
})

export type ForgotPasswordValues = z.infer<typeof formSchema>

export interface ForgotPasswordPageProps {
  brandName?: string
  logo?: ReactNode
  showcase?: ReactNode
  title?: string
  subtitle?: string
  submitLabel?: string
  onSubmit: (values: ForgotPasswordValues) => Promise<void> | void
  headerSlot?: ReactNode
  footerSlot?: ReactNode
  className?: string
}

export function ForgotPasswordPage({
  brandName,
  logo,
  showcase,
  title = 'Recuperar acceso',
  subtitle = 'Te enviaremos instrucciones a tu correo.',
  submitLabel = 'Continuar',
  onSubmit,
  headerSlot,
  footerSlot,
  className,
}: ForgotPasswordPageProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })

  async function handleSubmit(data: ForgotPasswordValues) {
    setIsLoading(true)
    try {
      await onSubmit(data)
      form.reset()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='h-svh flex overflow-hidden'>
      <div className='w-full lg:w-1/2 flex flex-col bg-background'>
        {(logo || brandName || headerSlot) && (
          <div className='px-6 pt-8 pb-4 lg:px-12 xl:px-20 max-w-lg mx-auto w-full'>
            <div className='flex items-center justify-center gap-3'>
              {(logo || brandName) && (
                <div className='inline-flex items-center gap-2'>
                  {logo}
                  {brandName && <span className='text-lg font-semibold'>{brandName}</span>}
                </div>
              )}
              {headerSlot && (
                <>
                  <span className='text-muted-foreground/50'>|</span>
                  <div className='text-sm text-muted-foreground'>{headerSlot}</div>
                </>
              )}
            </div>
          </div>
        )}

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 xl:px-20 max-w-lg mx-auto w-full'>
          <div className='mb-8 text-center lg:text-left'>
            <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
            {subtitle && (
              <p className='text-muted-foreground text-sm mt-1'>{subtitle}</p>
            )}
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className={cn('grid gap-2', className)}
            >
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input placeholder='name@example.com' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className='mt-2' disabled={isLoading}>
                {submitLabel}
                {isLoading ? <Loader2 className='animate-spin' /> : <ArrowRight />}
              </Button>
              {footerSlot}
            </form>
          </Form>
        </div>
      </div>

      {showcase && (
        <div className='hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 flex-col items-center pt-12 relative overflow-hidden'>
          {showcase}
        </div>
      )}
    </div>
  )
}
