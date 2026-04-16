import { NextRequest, NextResponse } from 'next/server';
import type { Session } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('mc-session');

  if (!cookie?.value) {
    return NextResponse.json(
      { ok: false, error: 'No autenticado' },
      { status: 401 },
    );
  }

  try {
    const session: Session = JSON.parse(cookie.value);
    return NextResponse.json({ ok: true, session });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Sesión inválida' },
      { status: 401 },
    );
  }
}
