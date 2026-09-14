import { NextRequest, NextResponse } from 'next/server';
import { syncSpotifyPlaylist } from '@/lib/spotify';
import { isDebugAuthorised } from '@/lib/debugAuth';

// Rewrites the live playlist, so it must not be callable by anyone with the URL.
export async function POST(req: NextRequest) {
  if (!isDebugAuthorised(req)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  try {
    const result = await syncSpotifyPlaylist();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
