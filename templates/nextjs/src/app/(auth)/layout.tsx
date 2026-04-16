import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get('mc-session');

  if (session?.value) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-pink-950/20 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white font-bold text-lg shadow-lg shadow-pink-500/20">
          M
        </div>
        <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
          metacore
        </span>
      </div>
      {children}
    </div>
  );
}
