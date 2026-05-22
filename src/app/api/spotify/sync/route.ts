import { NextResponse } from 'next/server';
import { syncSpotifyPlaylist } from '@/lib/spotify';

export async function POST() {
  try {
    const result = await syncSpotifyPlaylist();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
