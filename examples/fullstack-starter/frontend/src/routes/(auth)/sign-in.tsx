import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { AuthLayout, SignInPage } from '@asteby/metacore-auth/pages'
import { useAuthStore } from '@asteby/metacore-auth/store'
import { toast } from 'sonner'
import { z } from 'zod'
import { api } from '@/lib/api'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  validateSearch: searchSchema,
  component: SignInRoute,
})

function SignInRoute() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout brandName="Metacore Starter">
      <SignInPage
        brandName="Metacore Starter"
        redirectTo={redirect}
        onSubmit={async ({ email, password, redirectTo }) => {
          try {
            const { data } = await api.post('/auth/login', { email, password })
            const payload = data?.data ?? data
            useAuthStore.getState().auth.setAccessToken(payload.token ?? payload.accessToken ?? '')
            useAuthStore.getState().auth.setUser(payload.user ?? null)
            navigate({ to: redirectTo ?? '/' })
          } catch (err) {
            toast.error('Could not sign in. Check your credentials.')
            throw err
          }
        }}
      />
    </AuthLayout>
  )
}
