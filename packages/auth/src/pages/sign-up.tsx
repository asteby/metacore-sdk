import { useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
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
import { PasswordInput } from '../components/password-input'

/**
 * Single-step sign-up schema. Apps that need a multi-step wizard (e.g. Ops'
 * account → organization → complete flow) should compose their own stepper
 * using these building blocks — the kit ships a sensible default.
 *
 * TODO(compose): extract the Ops multi-step wizard into `SignUpWizard` once we
 * have a second app that needs it. For now keep the interface simple.
 */
const formSchema = z
  .object({
    name: z.string().min(1, 'Ingresa tu nombre completo'),
    email: z.string().email('Ingresa un correo válido'),
    password: z
      .string()
      .min(1, 'Ingresa una contraseña')
      .min(7, 'Mínimo 7 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

export type SignUpValues = z.infer<typeof formSchema>

export interface SignUpPageProps {
  brandName?: string
  logo?: ReactNode
  showcase?: ReactNode
  title?: string
  subtitle?: string
  submitLabel?: string
  onSubmit: (values: SignUpValues) => Promise<void> | void
  headerSlot?: ReactNode
  footerSlot?: ReactNode
  className?: string
}

export function SignUpPage({
  brandName,
  logo,
  showcase,
  title = 'Crea tu cuenta',
  subtitle,
  submitLabel = 'Crear cuenta',
  onSubmit,
  headerSlot,
  footerSlot,
  className,
}: SignUpPageProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function handleSubmit(data: SignUpValues) {
    setIsLoading(true)
    try {
      await onSubmit(data)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='h-svh flex overflow-hidden'>
      <div className='w-full lg:w-[45%] flex flex-col'>
        {(logo || brandName || headerSlot) && (
          <div className='px-6 pt-8 pb-4 lg:px-12 xl:px-16 max-w-md mx-auto w-full'>
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

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 xl:px-16 max-w-md mx-auto w-full overflow-y-auto'>
          <div className='mb-8 text-center lg:text-left'>
            <h2 className='text-2xl font-bold tracking-tight'>{title}</h2>
            {subtitle && (
              <p className='text-muted-foreground text-sm mt-1'>{subtitle}</p>
            )}
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className={cn('space-y-3', className)}
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Nombre completo</FormLabel>
                    <FormControl>
                      <Input placeholder='María García' className='h-9' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input
                        type='email'
                        placeholder='maria@empresa.com'
                        className='h-9'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-2 gap-3'>
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>Contraseña</FormLabel>
                      <FormControl>
                        <PasswordInput placeholder='********' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='confirmPassword'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>Confirmar</FormLabel>
                      <FormControl>
                        <PasswordInput placeholder='********' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type='submit' className='w-full h-10' disabled={isLoading}>
                {isLoading ? <Loader2 className='animate-spin' /> : submitLabel}
              </Button>

              {footerSlot}
            </form>
          </Form>
        </div>
      </div>

      {showcase && (
        <div className='hidden lg:flex lg:w-[55%] bg-muted/50 dark:bg-muted/20 flex-col justify-center relative overflow-hidden'>
          {showcase}
        </div>
      )}
    </div>
  )
}
