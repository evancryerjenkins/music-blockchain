import { MusicNode } from './types';
import { getMainChain } from './mainChain';
import { createClient } from '@supabase/supabase-js';
import { redis } from './rateLimit';

const REDIS_REFRESH_TOKEN_KEY = 'spotify:refresh_token';

async function getStoredRefreshToken(): Promise<string> {
  const stored = await redis.get<string>(REDIS_REFRESH_TOKEN_KEY).catch(() => null);
  return stored ?? process.env.SPOTIFY_REFRESH_TOKEN!;
}

async function getAccessToken(): Promise<string> {
  const refreshToken = await getStoredRefreshToken();
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Spotify token refresh failed: ${JSON.stringify(data)}`);
  // Spotify may rotate the refresh token — persist the new one so it's never lost.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await redis.set(REDIS_REFRESH_TOKEN_KEY, data.refresh_token).catch(() => null);
  }
  return data.access_token as string;
}

async function searchTrack(title: string, artist: string, token: string): Promise<string | null> {
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`;
  const headers = { Authorization: `Bearer ${token}` };

  while (true) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return (data?.tracks?.items?.[0]?.uri as string) ?? null;
  }
}

// Look up a Spotify URI for a single track and save it to the DB.
// Uses the service role key to bypass RLS for the UPDATE.
export async function lookupAndSaveSpotifyUri(nodeId: string, title: string, artist: string): Promise<void> {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REFRESH_TOKEN) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const token = await getAccessToken().catch(() => null);
  if (!token) return;

  const uri = await searchTrack(title, artist, token).catch(() => null);
  if (!uri) return;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await supabase.from('music_nodes').update({ spotify_uri: uri }).eq('id', nodeId);
}

// Sync the main chain to the Spotify playlist using cached URIs — 1 API call.
export async function syncSpotifyPlaylist(): Promise<{ ok: boolean; tracks?: number; error?: string }> {
  const playlistId = process.env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID;
  if (!playlistId || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REFRESH_TOKEN) {
    return { ok: false, error: 'Spotify env vars not configured' };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.from('music_nodes').select('*');
  if (error || !data) return { ok: false, error: 'Failed to load nodes' };

  const chain = getMainChain(data as MusicNode[]);
  if (!chain.length) return { ok: false, error: `getMainChain returned empty (${data.length} nodes loaded)` };

  const uris = chain.map(n => n.spotify_uri).filter((u): u is string => !!u);
  if (!uris.length) return { ok: false, error: 'No cached Spotify URIs — run: npx tsx scripts/backfill-spotify-uris.ts' };

  const token = await getAccessToken();

  // PUT replaces the playlist with the first batch (max 100)
  const firstBatch = uris.slice(0, 100);
  const putRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: firstBatch }),
  });
  const putBody = await putRes.json().catch(() => null);
  if (putRes.status !== 200 && putRes.status !== 201) {
    return { ok: false, error: `Spotify PUT failed (${putRes.status}): ${JSON.stringify(putBody)}` };
  }

  // POST appends remaining tracks in batches of 100
  for (let i = 100; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const postRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    });
    if (postRes.status !== 200 && postRes.status !== 201) {
      const postBody = await postRes.json().catch(() => null);
      return { ok: false, error: `Spotify POST batch ${i} failed (${postRes.status}): ${JSON.stringify(postBody)}` };
    }
  }

  return { ok: true, tracks: uris.length };
}
