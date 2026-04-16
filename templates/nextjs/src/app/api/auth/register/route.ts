import { NextResponse } from 'next/server';
import { createUser } from '@/lib/auth-store';
import type { Session } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { ok: false, error: 'Todos los campos son requeridos' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Formato de email inválido' },
        { status: 400 },
      );
    }

    let user;
    try {
      user = await createUser(email, password, name);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al crear usuario';
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
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
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
