// TEMPORARY DEBUG — delete after investigating 403
import { NextResponse } from 'next/server';

async function getAccessToken(): Promise<Record<string, unknown>> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.SPOTIFY_REFRESH_TOKEN! }),
  });
  const data = await res.json();
  return data;
}

export async function GET() {
  const tokenData = await getAccessToken();
  const token = tokenData.access_token as string;

  const [meRes, playlistRes] = await Promise.all([
    fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`https://api.spotify.com/v1/playlists/${process.env.NEXT_PUBLIC_SPOTIFY_PLAYLIST_ID}?fields=id,name,owner,public,collaborative`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const [me, playlist] = await Promise.all([meRes.json(), playlistRes.json()]);

  const q = encodeURIComponent('track:Red Room artist:Hiatus Kaiyote');
  const putRes = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const putBody = await putRes.json().catch(() => null);

  return NextResponse.json({
    token_scopes: tokenData.scope,
    me_id: me.id,
    me_display_name: me.display_name,
    playlist_owner_id: playlist.owner?.id,
    playlist_public: playlist.public,
    playlist_collaborative: playlist.collaborative,
    is_owner: me.id === playlist.owner?.id,
    put_status: putRes.status,
    put_body: putBody,
  });
}
