import { NextRequest, NextResponse } from 'next/server';
import { ItunesTrack } from '@/lib/types';

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('term');
  if (!term || term.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=12&lang=en_us`;
    const res = await fetch(url, { next: { revalidate: 60 } });
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
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
