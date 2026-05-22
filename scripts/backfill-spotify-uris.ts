// One-time backfill: populates spotify_uri for all existing music_nodes.
// Run with: npx tsx --env-file=.env.local scripts/backfill-spotify-uris.ts
//
// Requires in .env.local:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.SPOTIFY_REFRESH_TOKEN! }),
  });
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function searchTrack(title: string, artist: string, token: string): Promise<string | null> {
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`;
  const headers = { Authorization: `Bearer ${token}` };

  while (true) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      console.log(`\n  Rate limited — waiting ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json().catch(() => null) as { tracks?: { items?: { uri: string }[] } } | null;
    return data?.tracks?.items?.[0]?.uri ?? null;
  }
}

async function main() {
  const { data: nodes, error } = await supabase
    .from('music_nodes')
    .select('id, song_title, artist, spotify_uri')
    .is('spotify_uri', null);

  if (error) throw new Error(`Failed to fetch nodes: ${error.message}`);
  if (!nodes?.length) { console.log('All nodes already have Spotify URIs.'); return; }

  console.log(`Backfilling ${nodes.length} nodes...`);
  const token = await getAccessToken();

  let found = 0;
  let notFound = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    process.stdout.write(`[${i + 1}/${nodes.length}] ${node.song_title} — ${node.artist} ... `);

    const uri = await searchTrack(node.song_title, node.artist, token);
    if (uri) {
      await supabase.from('music_nodes').update({ spotify_uri: uri }).eq('id', node.id);
      console.log('ok');
      found++;
    } else {
      console.log('not found');
      notFound++;
    }

    // 1 request/second to stay well under rate limits
    if (i < nodes.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nDone. Found: ${found}, not found: ${notFound}`);
}

main().catch(e => { console.error(e); process.exit(1); });
