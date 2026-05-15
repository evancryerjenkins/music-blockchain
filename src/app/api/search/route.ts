import { NextRequest, NextResponse } from 'next/server';
import { ItunesTrack } from '@/lib/types';
import { rateLimit } from '@/lib/rateLimit';

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function GET(req: NextRequest) {
  // burst of 15, refills at 0.5/s (≈30/min steady state)
  if (!rateLimit(getIp(req), 15, 0.5)) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const term = req.nextUrl.searchParams.get('term');
  if (!term || term.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }
  if (term.length > 200) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=12&lang=en_us`;
    const res = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    const results: ItunesTrack[] = (data.results || []).map((r: Record<string, unknown>) => ({
      trackId: r.trackId,
      trackName: r.trackName,
      artistName: r.artistName,
      primaryGenreName: r.primaryGenreName,
      releaseDate: r.releaseDate,
      artworkUrl100: (r.artworkUrl100 as string)?.replace('100x100', '300x300') ?? null,
      trackViewUrl: r.trackViewUrl,
      previewUrl: r.previewUrl ?? null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[GET /api/search]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
