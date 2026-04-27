import { useState } from 'react'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LayoutDashboard, Users, BarChart3, TrendingUp, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@asteby/metacore-auth/store'
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

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/(auth)/sign-in')({
  validateSearch: searchSchema,
  component: SignIn,
})

const formSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo electrónico').email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña').min(7, 'Mínimo 7 caracteres'),
})

const showcaseModules = [
  { icon: LayoutDashboard, label: 'Dashboard', color: 'bg-emerald-500/10 text-emerald-600' },
  { icon: Users, label: 'Usuarios', color: 'bg-blue-500/10 text-blue-600' },
  { icon: BarChart3, label: 'Reportes', color: 'bg-amber-500/10 text-amber-600' },
  { icon: TrendingUp, label: 'Métricas', color: 'bg-violet-500/10 text-violet-600' },
]

function SignIn() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const { auth } = useAuthStore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    api
      .post('/auth/login', data)
      .then((response) => {
        const payload = response.data?.data ?? response.data
        auth.setUser(payload.user ?? null)
        auth.setAccessToken(payload.token ?? '')
        navigate({ to: redirect || '/', replace: true })
        toast.success(`Bienvenido, ${payload.user?.name ?? 'usuario'}!`)
      })
      .catch((error) => {
        toast.error(error.response?.data?.message || 'Credenciales incorrectas')
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
              ¿Nuevo?{' '}
              <Link to='/sign-up' className='text-primary font-medium hover:underline underline-offset-4'>
                Crear cuenta
              </Link>
            </div>
          </div>
        </div>

        <div className='flex-1 flex flex-col justify-center px-6 lg:px-12 xl:px-16 max-w-md mx-auto w-full'>
          <div className='mb-8 text-center lg:text-left'>
            <h1 className='text-2xl font-bold tracking-tight'>Iniciar sesión</h1>
            <p className='text-muted-foreground text-sm mt-1'>
              Accede al panel de administración
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-3')}>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input placeholder='tu@email.com' autoComplete='email' className='h-10' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>Contraseña</FormLabel>
                    <FormControl>
                      <div className='relative'>
                        <Input type={showPassword ? 'text' : 'password'} placeholder='••••••••' autoComplete='current-password' className='h-10 pr-10' {...field} />
                        <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'>
                          {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className='w-full h-10' disabled={isLoading}>
                {isLoading ? <Loader2 className='animate-spin' /> : 'Entrar al panel'}
              </Button>
            </form>
          </Form>
        </div>

        <div className='px-6 py-6 lg:px-12 xl:px-16 max-w-md mx-auto w-full border-t'>
          <p className='text-center text-xs text-muted-foreground'>
            Powered by Metacore
          </p>
        </div>
      </div>

      {/* Right - Showcase */}
      <div className='hidden lg:flex lg:w-[55%] bg-muted/50 dark:bg-muted/20 flex-col justify-center relative overflow-hidden'>
        <div className='absolute inset-0 opacity-[0.03]'
          style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className='relative z-10 px-12 xl:px-20 max-w-2xl mx-auto w-full'>
          <div className='inline-flex items-center gap-2 text-primary mb-3'>
            <TrendingUp className='size-5' />
            <span className='text-sm font-medium'>Metacore Platform</span>
          </div>
          <h2 className='text-3xl font-bold tracking-tight mb-2'>
            Tu plataforma,{' '}
            <span className='text-primary'>lista para producción.</span>
          </h2>
          <p className='text-muted-foreground text-sm max-w-md mb-10'>
            Auth, CRUD dinámico, metadatos, webhooks, push — todo desde el kernel. Solo define tus modelos.
          </p>
          <div className='grid grid-cols-4 gap-3'>
            {showcaseModules.map((mod) => (
              <div key={mod.label} className='flex flex-col items-center gap-2 p-4 rounded-xl bg-background/60 border border-border/50 hover:border-primary/30 transition-colors'>
                <div className={`size-10 rounded-lg flex items-center justify-center ${mod.color}`}>
                  <mod.icon className='size-5' />
                </div>
                <span className='text-xs font-medium text-muted-foreground'>{mod.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
