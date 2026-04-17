import { Button } from '@asteby/metacore-starter-core'

export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Welcome to metacore
        </h1>
        <p className="text-muted-foreground max-w-md">
          Your app is wired to <code>@asteby/metacore-starter-core</code> and{' '}
          <code>@asteby/metacore-starter-config</code>. Edit{' '}
          <code>src/App.tsx</code> to get started.
        </p>
        <Button onClick={() => console.log('metacore!')}>Click me</Button>
      </section>
    </main>
  )
}
