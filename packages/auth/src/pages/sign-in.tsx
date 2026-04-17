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

const formSchema = z.object({
  email: z
    .string()
    .min(1, 'Por favor, ingresa tu correo electrónico')
    .email('Correo electrónico inválido'),
  password: z
    .string()
    .min(1, 'Por favor, ingresa tu contraseña')
    .min(7, 'La contraseña debe tener al menos 7 caracteres'),
})

export type SignInValues = z.infer<typeof formSchema>

export interface SignInPageProps {
  /** Brand display name (e.g. `"Ops"`). No default — caller owns branding. */
  brandName?: string
  /** Logo slot (any React node). */
  logo?: ReactNode
  /**
   * Showcase slot rendered on the right-hand side on lg+ viewports. Typically a
   * marketing panel (module grid, hero illustration, etc.). If omitted, only
   * the form column is rendered.
   */
  showcase?: ReactNode
  /** Form heading. */
  title?: string
  /** Form subtitle. */
  subtitle?: string
  /** Submit-button label when idle. */
  submitLabel?: string
  /**
   * Submit handler. Receive `{ email, password }` + an optional `redirectTo`
   * value passed through by the app. Resolve to signal success; reject to let
   * the form surface an error.
   */
  onSubmit: (values: SignInValues & { redirectTo?: string }) => Promise<void> | void
  /** Optional upstream redirect target (from a route search param). */
  redirectTo?: string
  /** Slot for extra links (e.g. "Forgot password?", "Sign up"). */
  headerSlot?: ReactNode
  /** Slot rendered below the submit button (e.g. terms copy, OAuth buttons). */
  footerSlot?: ReactNode
  /** Forgot-password link shown above the password input. */
  forgotPasswordSlot?: ReactNode
  /** Email-field label. */
  emailLabel?: string
  /** Password-field label. */
  passwordLabel?: string
  /** Extra className on the form element. */
  className?: string
}

/**
 * Generic, brand-less sign-in page. Owns the form + client validation, delegates
 * the network call to `onSubmit`.
 */
export function SignInPage({
  brandName,
  logo,
  showcase,
  title = 'Iniciar sesión',
  subtitle,
  submitLabel = 'Entrar',
  onSubmit,
  redirectTo,
  headerSlot,
  footerSlot,
  forgotPasswordSlot,
  emailLabel = 'Correo electrónico',
  passwordLabel = 'Contraseña',
  className,
}: SignInPageProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SignInValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  async function handleSubmit(data: SignInValues) {
    setIsLoading(true)
    try {
      await onSubmit({ ...data, redirectTo })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='h-svh flex overflow-hidden'>
      <div className='w-full lg:w-[45%] flex flex-col bg-background'>
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

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 xl:px-16 max-w-md mx-auto w-full'>
          <div className='mb-8 text-center lg:text-left'>
            <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
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
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>{emailLabel}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='tu@email.com'
                        autoComplete='email'
                        className='h-10'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem className='relative'>
                    <div className='flex items-center justify-between'>
                      <FormLabel className='text-xs'>{passwordLabel}</FormLabel>
                      {forgotPasswordSlot}
                    </div>
                    <FormControl>
                      <PasswordInput
                        placeholder='********'
                        autoComplete='current-password'
                        className='h-10'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className='w-full h-10' disabled={isLoading}>
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
