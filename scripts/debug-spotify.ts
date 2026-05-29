// Debug Spotify auth and playlist write access.
// Run with: npx tsx --env-file=.env.local scripts/debug-spotify.ts

async function main() {
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.SPOTIFY_REFRESH_TOKEN! }),
  });
  const tokenData = await tokenRes.json() as Record<string, unknown>;
  console.log('Token response status:', tokenRes.status);
  console.log('Scopes:', tokenData.scope);
  console.log('Has access_token:', !!tokenData.access_token);
  if (!tokenData.access_token) { console.error('Full response:', JSON.stringify(tokenData)); process.exit(1); }
  const token = tokenData.access_token as string;

  const playlistId = process.env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID!;

  const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  const me = await meRes.json() as Record<string, unknown>;
  console.log('\n/v1/me status:', meRes.status, '— id:', me.id);

  const plRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,owner`, { headers: { Authorization: `Bearer ${token}` } });
  const pl = await plRes.json() as Record<string, unknown>;
  const owner = pl.owner as Record<string, unknown> | undefined;
  console.log(`/v1/playlists status:`, plRes.status, '— owner:', owner?.id, '— is_owner:', me.id === owner?.id);

  const rickUri = 'spotify:track:4uLU6hMCjMI75M1A2tKUQC';

  // Test PUT /tracks
  const putTracksRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [rickUri] }),
  });
  console.log('\nPUT /tracks status:', putTracksRes.status, JSON.stringify(await putTracksRes.json().catch(() => null)));

  // Test PUT /items
  const putItemsRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [rickUri] }),
  });
  console.log('PUT /items status:', putItemsRes.status, JSON.stringify(await putItemsRes.json().catch(() => null)));

  // Test POST /tracks
  const postRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [rickUri] }),
  });
  console.log('POST /tracks status:', postRes.status, JSON.stringify(await postRes.json().catch(() => null)));
}

main().catch(e => { console.error(e); process.exit(1); });
