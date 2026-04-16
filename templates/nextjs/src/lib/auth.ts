// Client-side auth helpers.
// These run in the browser and talk to the Next.js route handlers.

export interface Session {
  id: string;
  email: string;
  name: string;
  orgId: string;
  token: string;
  role: 'admin' | 'member';
}

const COOKIE_NAME = 'mc-session';

// ---------------------------------------------------------------------------
// Auth actions (browser → route handlers)
// ---------------------------------------------------------------------------

export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? 'Error al iniciar sesión');
  }

  return data.session as Session;
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<Session> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? 'Error al crear cuenta');
  }

  return data.session as Session;
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Session reading (client-side, from cookie)
// ---------------------------------------------------------------------------

export function getSession(): Session | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function authHeaders(): HeadersInit {
  const session = getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.token}` };
}
