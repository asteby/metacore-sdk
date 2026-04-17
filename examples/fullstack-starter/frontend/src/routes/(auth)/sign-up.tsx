import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AuthLayout, SignUpPage } from '@asteby/metacore-auth/pages'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/(auth)/sign-up')({
  component: SignUpRoute,
})

function SignUpRoute() {
  const navigate = useNavigate()
  return (
    <AuthLayout brandName="Metacore Starter">
      <SignUpPage
        brandName="Metacore Starter"
        onSubmit={async ({ name, email, password }) => {
          try {
            await api.post('/auth/register', { name, email, password })
            toast.success('Account created. You can now sign in.')
            navigate({ to: '/sign-in' })
          } catch (err) {
            toast.error('Sign-up failed.')
            throw err
          }
        }}
      />
    </AuthLayout>
  )
}
