import { MusicNode } from './types';
import { getMainChain } from './mainChain';
import { createClient } from '@supabase/supabase-js';
import { redis } from './rateLimit';

const REDIS_REFRESH_TOKEN_KEY = 'spotify:refresh_token';

async function getStoredRefreshToken(): Promise<string> {
  const stored = await redis.get<string>(REDIS_REFRESH_TOKEN_KEY).catch(() => null);
  return stored ?? process.env.SPOTIFY_REFRESH_TOKEN!;
}

export async function getAccessToken(): Promise<string> {
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

// iTunes titles carry suffixes Spotify does not use — "(feat. X)", "[2023 Remaster]",
// "(instrumental)" — and a track: field filter matches none of them. Strip those only
// as a FALLBACK: stripping first returns wrong songs (track:Theme once matched
// "The Batman" for 'Theme (from "Spider Man")').
const TITLE_SUFFIX = /\s*[([][^)\]]*[)\]]/g;

function stripTitle(title: string): string {
  return title.replace(TITLE_SUFFIX, '').trim();
}

function primaryArtist(artist: string): string {
  return artist.split(/,|&|feat\.?|ft\.?/i)[0].trim();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface SpotifyTrack { uri: string; name?: string; artists?: { name: string }[] }

// One search. Distinguishes "no match" from "Spotify was unavailable" — treating a
// 502 as not-found once made a backfill report 41 missing tracks that all existed.
async function searchOnce(q: string, token: string, limit: number): Promise<SpotifyTrack[]> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`;
  const headers = { Authorization: `Bearer ${token}` };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      await new Promise(r => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      continue;
    }
    if (res.status >= 500) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return (data?.tracks?.items as SpotifyTrack[]) ?? [];
  }
  return [];
}

// Try the exact title first, then progressively looser queries. Every candidate must
// match on artist, so a loose query cannot silently return the wrong song.
export async function searchTrack(title: string, artist: string, token: string): Promise<string | null> {
  const bare = stripTitle(title);
  const lead = primaryArtist(artist);

  // The last query drops the field filters entirely, which is the only way to reach
  // tracks Spotify spells differently ("Ooh Baby Baby" is "Ooo Baby Baby" there).
  // limit=1 on the exact query preserves the historical pick: Spotify returns a
  // different top result for limit=1 and limit=5 on one and the same query.
  const queries: { q: string; loose: boolean; limit: number }[] = [{ q: `track:${title} artist:${artist}`, loose: false, limit: 1 }];
  if (bare && bare !== title) queries.push({ q: `track:${bare} artist:${artist}`, loose: false, limit: 5 });
  if (lead !== artist) queries.push({ q: `track:${bare || title} artist:${lead}`, loose: false, limit: 5 });
  queries.push({ q: `${bare || title} ${lead}`, loose: true, limit: 5 });

  const wantedArtist = norm(lead);
  const wantedWords = new Set(norm(bare || title).split(' ').filter(w => w.length > 2));

  for (const { q, loose, limit } of queries) {
    const items = await searchOnce(q, token, limit);
    const hit = items.find(t => {
      const artistOk = (t.artists ?? []).some(a => {
        const n = norm(a.name);
        return n === wantedArtist || n.includes(wantedArtist) || wantedArtist.includes(n);
      });
      if (!artistOk) return false;
      // Without a track: filter, the right artist alone would match any of their songs.
      if (!loose || wantedWords.size === 0) return true;
      return norm(t.name ?? '').split(' ').some(w => wantedWords.has(w));
    });
    if (hit?.uri) return hit.uri;
  }
  return null;
}

// Look up a Spotify URI for a single track and save it to the DB.
// Uses the service role key to bypass RLS for the UPDATE.
// Returns a reason on failure so callers can log why a node has no URI.
export async function lookupAndSaveSpotifyUri(nodeId: string, title: string, artist: string): Promise<{ ok: boolean; reason?: string }> {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REFRESH_TOKEN) {
    return { ok: false, reason: 'Spotify env vars not configured' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    return { ok: false, reason: `token refresh failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  let uri: string | null;
  try {
    uri = await searchTrack(title, artist, token);
  } catch (e) {
    return { ok: false, reason: `search threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!uri) return { ok: false, reason: `no Spotify match for "${title}" — ${artist}` };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { error } = await supabase.from('music_nodes').update({ spotify_uri: uri }).eq('id', nodeId);
  if (error) return { ok: false, reason: `DB update failed: ${error.message}` };
  return { ok: true };
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
