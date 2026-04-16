import { NextRequest, NextResponse } from 'next/server';
import { installedAddons } from '../catalog/route';

// POST /api/marketplace/uninstall
// Body: { addonKey: string }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { addonKey } = body;

    if (!addonKey || typeof addonKey !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'addonKey es requerido' },
        { status: 400 },
      );
    }

    if (!installedAddons.has(addonKey)) {
      return NextResponse.json(
        { ok: false, error: 'Addon no está instalado' },
        { status: 404 },
      );
    }

    // In production this would call the kernel to unregister routes/tables/nav.
    installedAddons.delete(addonKey);

    return NextResponse.json({ ok: true, removed: addonKey });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error procesando la solicitud' },
      { status: 500 },
    );
  }
}
