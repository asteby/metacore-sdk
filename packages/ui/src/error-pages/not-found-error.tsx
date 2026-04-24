import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/primitives/button'

export function NotFoundError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>404</h1>
        <span className='font-medium'>¡Ups! ¡Página no encontrada!</span>
        <p className='text-muted-foreground text-center'>
          Parece que la página que estás buscando <br />
          no existe o puede haber sido eliminada.
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            Volver
          </Button>
          <Button onClick={() => navigate({ to: '/' })}>Volver al Inicio</Button>
        </div>
      </div>
    </div>
  )
}
