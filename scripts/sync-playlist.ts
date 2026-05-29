// Syncs the Spotify playlist to match the current main chain.
// Run with: npx tsx --env-file=.env.local scripts/sync-playlist.ts

import { syncSpotifyPlaylist } from '../src/lib/spotify';

syncSpotifyPlaylist().then(result => {
  if (result.ok) {
    console.log(`Playlist synced — ${result.tracks} tracks.`);
  } else {
    console.error(`Playlist sync failed: ${result.error}`);
    process.exit(1);
  }
}).catch(e => { console.error(e); process.exit(1); });
