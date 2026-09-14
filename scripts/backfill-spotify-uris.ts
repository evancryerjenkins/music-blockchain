// One-time backfill: populates spotify_uri for all existing music_nodes.
// Run with: npx tsx --env-file=.env.local scripts/backfill-spotify-uris.ts
//
// Requires in .env.local:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { getAccessToken, searchTrack, syncSpotifyPlaylist } from '../src/lib/spotify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: nodes, error } = await supabase
    .from('music_nodes')
    .select('id, song_title, artist, spotify_uri')
    .is('spotify_uri', null);

  if (error) throw new Error(`Failed to fetch nodes: ${error.message}`);
  if (!nodes?.length) {
    console.log('All nodes already have Spotify URIs. Syncing playlist...');
    const result = await syncSpotifyPlaylist();
    if (result.ok) console.log(`Playlist synced — ${result.tracks} tracks.`);
    else console.error(`Playlist sync failed: ${result.error}`);
    return;
  }

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

  console.log('\nSyncing playlist with main chain...');
  const result = await syncSpotifyPlaylist();
  if (result.ok) console.log(`Playlist synced — ${result.tracks} tracks.`);
  else console.error(`Playlist sync failed: ${result.error}`);
}

main().catch(e => { console.error(e); process.exit(1); });
