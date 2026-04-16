import { NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword } from '@/lib/auth-store';
import type { Session } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'Email y contraseña son requeridos' },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(email);

    if (!user || !(await verifyPassword(user, password))) {
      return NextResponse.json(
        { ok: false, error: 'Credenciales inválidas' },
        { status: 401 },
      );
    }

    const session: Session = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: user.orgId,
      token: crypto.randomUUID(),
      role: user.role,
    };

    const res = NextResponse.json({ ok: true, session });

    res.cookies.set('mc-session', JSON.stringify(session), {
      httpOnly: false, // readable by client JS for getSession()
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
