import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccessToken, searchTrack, syncSpotifyPlaylist } from '@/lib/spotify';
import { getMainChain } from '@/lib/mainChain';
import { MusicNode } from '@/lib/types';

// Never prerender: this route calls Spotify, which must not happen at build time.
export const dynamic = 'force-dynamic';

// Diagnostics for the Spotify sync, which fails silently in normal operation.
// Reports only booleans and error strings — never a credential value — so the
// response is safe to paste into a bug report.
export async function GET(req: NextRequest) {
  const secret = process.env.DEBUG_SECRET;
  if (!secret || req.headers.get('x-debug-secret') !== secret) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const env = {
    SPOTIFY_CLIENT_ID: !!process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: !!process.env.SPOTIFY_CLIENT_SECRET,
    SPOTIFY_REFRESH_TOKEN: !!process.env.SPOTIFY_REFRESH_TOKEN,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID: !!process.env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  // Does the refresh token actually still work against the current Spotify app?
  let token: string | null = null;
  let tokenRefresh: { ok: boolean; error?: string };
  try {
    token = await getAccessToken();
    tokenRefresh = { ok: true };
  } catch (e) {
    tokenRefresh = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // How much of the main chain is actually syncable.
  let chain: { length: number; withUri: number; missingUri: number } | { error: string };
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await supabase.from('music_nodes').select('*');
    if (error || !data) throw new Error(error?.message ?? 'no rows returned');
    const main = getMainChain(data as MusicNode[]);
    const withUri = main.filter(n => n.spotify_uri).length;
    chain = { length: main.length, withUri, missingUri: main.length - withUri };
  } catch (e) {
    chain = { error: e instanceof Error ? e.message : String(e) };
  }

  // ?search=Title|Artist — probe the lookup without writing anything.
  let search: { title: string; artist: string; uri: string | null } | { error: string } | null = null;
  const rawSearch = req.nextUrl.searchParams.get('search');
  if (rawSearch) {
    const [title, artist = ''] = rawSearch.split('|');
    if (!token) {
      search = { error: 'no access token' };
    } else {
      const uri = await searchTrack(title, artist, token).catch(() => null);
      search = { title, artist, uri };
    }
  }

  // ?sync=1 — run the real sync and surface the result that POST /api/nodes discards.
  const sync = req.nextUrl.searchParams.get('sync') === '1'
    ? await syncSpotifyPlaylist().catch(e => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    : null;

  return NextResponse.json({ env, tokenRefresh, chain, search, sync });
}
