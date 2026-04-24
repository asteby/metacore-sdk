import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
}

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>¡Ups! Algo salió mal {`:')`}</span>
        <p className='text-muted-foreground text-center'>
          Pedimos disculpas por las molestias. <br /> Por favor, inténtalo de nuevo más tarde.
        </p>
        {!minimal && (
          <div className='mt-6 flex gap-4'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              Volver
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>Volver al Inicio</Button>
          </div>
        )}
      </div>
    </div>
  )
}
