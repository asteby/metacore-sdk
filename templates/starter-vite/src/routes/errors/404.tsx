import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/errors/404')({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <Link to="/" className="text-primary underline">
        Back home
      </Link>
    </div>
  )
}
