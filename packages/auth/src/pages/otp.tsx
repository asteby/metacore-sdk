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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'

function buildSchema(length: number) {
  return z.object({
    otp: z
      .string()
      .min(length, `Por favor, ingresa el código de ${length} dígitos.`)
      .max(length, `Por favor, ingresa el código de ${length} dígitos.`),
  })
}

export type OtpValues = { otp: string }

export interface OtpPageProps {
  /** Brand display name. */
  brandName?: string
  /** Logo slot. */
  logo?: ReactNode
  /** Heading. */
  title?: string
  /** Subtitle (e.g. "Revisa tu correo"). */
  subtitle?: string
  /** OTP length. Default 6. */
  length?: number
  /** Submit-button label. */
  submitLabel?: string
  /** Resend-button label. */
  resendLabel?: string
  /** OTP field label. */
  otpLabel?: string
  /** Submit handler. */
  onSubmit: (values: OtpValues) => Promise<void> | void
  /** Optional resend handler. Hides the resend UI when omitted. */
  onResend?: () => Promise<void> | void
  /** Slot rendered above the form (e.g. contextual text). */
  headerSlot?: ReactNode
  /** Slot rendered below the submit button. */
  footerSlot?: ReactNode
  /** Extra className on the form. */
  className?: string
}

/**
 * Generic, brand-less one-time-code verification page.
 */
export function OtpPage({
  brandName,
  logo,
  title = 'Código de verificación',
  subtitle,
  length = 6,
  submitLabel = 'Verificar',
  resendLabel = 'Reenviar código',
  otpLabel = 'Código',
  onSubmit,
  onResend,
  headerSlot,
  footerSlot,
  className,
}: OtpPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const schema = buildSchema(length)

  const form = useForm<OtpValues>({
    resolver: zodResolver(schema),
    defaultValues: { otp: '' },
  })

  async function handleSubmit(data: OtpValues) {
    setIsLoading(true)
    try {
      await onSubmit(data)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResend() {
    if (!onResend) return
    setIsResending(true)
    try {
      await onResend()
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className='h-svh flex overflow-hidden'>
      <div className='w-full flex flex-col bg-background'>
        {(logo || brandName) && (
          <div className='px-6 pt-8 pb-4 lg:px-12 max-w-md mx-auto w-full'>
            <div className='flex items-center justify-center gap-2'>
              {logo}
              {brandName && <span className='text-lg font-semibold'>{brandName}</span>}
            </div>
          </div>
        )}

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 max-w-md mx-auto w-full'>
          <div className='mb-8 text-center'>
            <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
            {subtitle && (
              <p className='text-muted-foreground text-sm mt-1'>{subtitle}</p>
            )}
            {headerSlot}
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className={cn('space-y-4', className)}
            >
              <FormField
                control={form.control}
                name='otp'
                render={({ field }) => (
                  <FormItem className='flex flex-col items-center'>
                    <FormLabel className='sr-only'>{otpLabel}</FormLabel>
                    <FormControl>
                      <InputOTP maxLength={length} {...field}>
                        <InputOTPGroup>
                          {Array.from({ length }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className='w-full h-10' disabled={isLoading}>
                {isLoading ? <Loader2 className='animate-spin' /> : submitLabel}
              </Button>
              {onResend && (
                <Button
                  type='button'
                  variant='ghost'
                  className='w-full'
                  disabled={isResending}
                  onClick={handleResend}
                >
                  {isResending ? <Loader2 className='animate-spin' /> : resendLabel}
                </Button>
              )}
              {footerSlot}
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}
