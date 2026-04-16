import { NextRequest, NextResponse } from 'next/server';
import { installedAddons } from '../catalog/route';

// POST /api/marketplace/install
// Body: { addonKey: string, version?: string }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { addonKey, version } = body;

    if (!addonKey || typeof addonKey !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'addonKey es requerido' },
        { status: 400 },
      );
    }

    if (installedAddons.has(addonKey)) {
      return NextResponse.json(
        { ok: false, error: 'Addon ya instalado' },
        { status: 409 },
      );
    }

    // In production this would:
    // 1. Download the addon bundle from hub
    // 2. Call the kernel installer to register routes/tables/nav
    // For the template we just add to our in-memory store.

    installedAddons.add(addonKey);

    return NextResponse.json({
      ok: true,
      installed: addonKey,
      version: version ?? 'latest',
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error procesando la solicitud' },
      { status: 500 },
    );
  }
}
