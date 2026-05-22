// SETUP ONLY — visit /api/spotify/auth once to get your refresh token, then you can delete this file.
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'SPOTIFY_CLIENT_ID is not set in .env.local' }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:3003/api/spotify/callback',
    scope: 'playlist-modify-public playlist-modify-private user-read-private',
    show_dialog: 'true',
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
