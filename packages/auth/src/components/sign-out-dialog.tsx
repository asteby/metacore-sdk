import { useNavigate, useLocation } from '@tanstack/react-router'
import { ConfirmDialog } from '@asteby/metacore-ui/dialogs'
import { useAuthStore } from '../store'

export interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Path to redirect to after sign-out. Default `/sign-in`.
   */
  signInPath?: string
  /** Dialog title. */
  title?: string
  /** Dialog description. */
  desc?: string
  /** Confirm button text. */
  confirmText?: string
}

export function SignOutDialog({
  open,
  onOpenChange,
  signInPath = '/sign-in',
  title = 'Cerrar sesión',
  desc = '¿Estás seguro de que deseas cerrar sesión? Tendrás que iniciar sesión nuevamente para acceder a tu cuenta.',
  confirmText = 'Cerrar sesión',
}: SignOutDialogProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { auth } = useAuthStore()

  const handleSignOut = () => {
    auth.reset()
    const currentPath = location.href
    navigate({
      to: signInPath as never,
      search: { redirect: currentPath } as never,
      replace: true,
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desc={desc}
      confirmText={confirmText}
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
