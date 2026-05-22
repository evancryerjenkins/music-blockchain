// SETUP ONLY — delete this file after you have your refresh token.
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return new NextResponse(`<html><body style="font-family:sans-serif;padding:24px"><h2>Authorization denied</h2><p>${error}</p></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (!code) {
    return NextResponse.json({ error: 'No code in callback' }, { status: 400 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://127.0.0.1:3003/api/spotify/callback',
    }),
  });

  const data = await res.json();

  if (!data.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:24px"><h2>Error</h2><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  return new NextResponse(
    `<html><body style="font-family:monospace;padding:24px;max-width:800px">
    <h2>Spotify Setup — copy these values into <code>.env.local</code></h2>
    <p style="background:#f0fdf4;border:1px solid #86efac;padding:16px;border-radius:8px">
      <code>SPOTIFY_REFRESH_TOKEN=${data.refresh_token}</code>
    </p>
    <p>Then restart your dev server (<code>npm run dev</code>).</p>
    <p>You can now delete <code>src/app/api/spotify/auth/route.ts</code> and <code>src/app/api/spotify/callback/route.ts</code>.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
