'use client';

import { useEffect, useState } from 'react';
import { getSession, type Session } from '@/lib/auth';
import { useRouter } from 'next/navigation';

/**
 * Redirects to /login if no active session.
 * Returns the session once confirmed.
 */
export function useRequireAuth(): { session: Session | null; loading: boolean } {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
    } else {
      setSession(s);
    }
    setLoading(false);
  }, [router]);

  return { session, loading };
}
