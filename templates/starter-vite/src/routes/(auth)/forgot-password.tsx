import { createFileRoute } from '@tanstack/react-router'
import { AuthLayout, ForgotPasswordPage } from '@asteby/metacore-auth/pages'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/(auth)/forgot-password')({
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  return (
    <AuthLayout brandName="Metacore Starter">
      <ForgotPasswordPage
        brandName="Metacore Starter"
        onSubmit={async ({ email }) => {
          try {
            // TODO(host): adjust endpoint — most backends send a reset email here.
            await api.post('/auth/forgot-password', { email })
            toast.success('If the email exists, a reset link was sent.')
          } catch (err) {
            toast.error('Could not send reset link.')
            throw err
          }
        }}
      />
    </AuthLayout>
  )
}
