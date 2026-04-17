import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Rocket, Shield, Zap, Globe, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
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
import { api } from '@/lib/api'

export const Route = createFileRoute('/(auth)/sign-up')({
  component: SignUp,
})

const formSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
  organization_name: z.string().min(2, 'Nombre de la empresa'),
  password: z.string().min(7, 'Mínimo 7 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

const features = [
  { icon: Rocket, label: 'Setup en minutos', desc: 'Auth, CRUD y metadata listos' },
  { icon: Shield, label: 'Multi-tenant', desc: 'Aislamiento por organización' },
  { icon: Zap, label: 'UI dinámica', desc: 'Tablas generadas por metadatos' },
  { icon: Globe, label: 'Actualizable', desc: 'Kernel + SDK auto-propagados' },
]

function SignUp() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', organization_name: '', password: '', confirmPassword: '' },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    api
      .post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
        organization_name: data.organization_name,
      })
      .then(() => {
        toast.success('Cuenta creada. Ahora puedes iniciar sesión.')
        navigate({ to: '/sign-in' })
      })
      .catch((error) => {
        toast.error(error.response?.data?.message || 'Error al crear la cuenta')
      })
      .finally(() => setIsLoading(false))
  }

  return (
    <div className='h-svh flex overflow-hidden'>
      {/* Left - Form */}
      <div className='w-full lg:w-[45%] flex flex-col bg-background'>
        <div className='px-6 pt-8 pb-4 lg:px-12 xl:px-16 max-w-md mx-auto w-full'>
          <div className='flex items-center justify-center gap-3'>
            <Link to='/' className='inline-flex items-center gap-2'>
              <img src='/images/logo.svg' alt='Metacore' className='size-7' />
              <span className='text-lg font-semibold'>Metacore</span>
            </Link>
            <span className='text-muted-foreground/50'>|</span>
            <div className='text-sm text-muted-foreground'>
              ¿Ya tienes cuenta?{' '}
              <Link to='/sign-in' className='text-primary font-medium hover:underline underline-offset-4'>
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 xl:px-16 max-w-md mx-auto w-full overflow-y-auto'>
          <div className='mb-6 text-center lg:text-left'>
            <h1 className='text-2xl font-bold tracking-tight'>Crear cuenta</h1>
            <p className='text-muted-foreground text-sm mt-1'>
              Configura tu empresa en segundos
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-3')}>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Nombre completo</FormLabel>
                    <FormControl>
                      <Input placeholder='Juan Pérez' autoComplete='name' className='h-10' {...field} />
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
                      <Input placeholder='tu@empresa.com' autoComplete='email' className='h-10' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='organization_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Nombre de la empresa</FormLabel>
                    <FormControl>
                      <Input placeholder='Mi Empresa S.A.' className='h-10' {...field} />
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
                        <div className='relative'>
                          <Input type={showPassword ? 'text' : 'password'} placeholder='••••••••' className='h-10 pr-10' {...field} />
                          <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'>
                            {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                          </button>
                        </div>
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
                        <div className='relative'>
                          <Input type={showPassword ? 'text' : 'password'} placeholder='••••••••' className='h-10 pr-10' {...field} />
                          <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'>
                            {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button className='w-full h-10' disabled={isLoading}>
                {isLoading ? <Loader2 className='animate-spin' /> : 'Crear cuenta'}
              </Button>
              <p className='text-muted-foreground text-center text-xs mt-2'>
                Al registrarte aceptas los{' '}
                <a href='#' className='underline underline-offset-2 hover:text-foreground'>Términos</a>
                {' '}y{' '}
                <a href='#' className='underline underline-offset-2 hover:text-foreground'>Privacidad</a>.
              </p>
            </form>
          </Form>
        </div>

        <div className='px-6 py-4 lg:px-12 xl:px-16 max-w-md mx-auto w-full border-t'>
          <p className='text-center text-xs text-muted-foreground'>Powered by Metacore</p>
        </div>
      </div>

      {/* Right - Features */}
      <div className='hidden lg:flex lg:w-[55%] bg-muted/50 dark:bg-muted/20 flex-col justify-center relative overflow-hidden'>
        <div className='absolute inset-0 opacity-[0.03]'
          style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className='relative z-10 px-12 xl:px-20 max-w-2xl mx-auto w-full'>
          <h2 className='text-3xl font-bold tracking-tight mb-2'>
            Construido sobre{' '}
            <span className='text-primary'>Metacore.</span>
          </h2>
          <p className='text-muted-foreground text-sm max-w-md mb-10'>
            Un kernel que evoluciona — tú solo defines modelos, la plataforma hace el resto.
          </p>
          <div className='space-y-4'>
            {features.map((f) => (
              <div key={f.label} className='flex items-start gap-4 p-4 rounded-xl bg-background/60 border border-border/50'>
                <div className='size-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0'>
                  <f.icon className='size-5' />
                </div>
                <div>
                  <div className='text-sm font-medium'>{f.label}</div>
                  <div className='text-xs text-muted-foreground'>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
