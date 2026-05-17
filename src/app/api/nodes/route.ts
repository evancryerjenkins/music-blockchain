import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkSimilarity } from '@/lib/similarity';
import { MusicNode } from '@/lib/types';
import { rateLimit } from '@/lib/rateLimit';
import { getIp } from '@/lib/getIp';

function isAllowedUrl(url: unknown): boolean {
  if (url === undefined || url === null) return true;
  if (typeof url !== 'string') return false;
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.apple.com') || hostname.endsWith('.mzstatic.com');
  } catch {
    return false;
  }
}

function validateBody(body: Record<string, unknown>): string | null {
  const { song_title, artist, genre, year, album_art, itunes_url, preview_url, added_by } = body;
  if (typeof song_title !== 'string' || song_title.trim().length === 0 || song_title.length > 500)
    return 'song_title must be a non-empty string under 500 characters.';
  if (typeof artist !== 'string' || artist.trim().length === 0 || artist.length > 500)
    return 'artist must be a non-empty string under 500 characters.';
  if (genre !== undefined && genre !== null && (typeof genre !== 'string' || genre.length > 100))
    return 'genre must be a string under 100 characters.';
  if (year !== undefined && year !== null && (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100))
    return 'year must be an integer between 1900 and 2100.';
  if (!isAllowedUrl(album_art))   return 'album_art must be an Apple/iTunes URL.';
  if (!isAllowedUrl(itunes_url))  return 'itunes_url must be an Apple/iTunes URL.';
  if (!isAllowedUrl(preview_url)) return 'preview_url must be an Apple/iTunes URL.';
  if (typeof added_by !== 'string' || added_by.trim().length === 0 || added_by.length > 100)
    return 'added_by must be a non-empty name under 100 characters.';
  return null;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}


export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('music_nodes')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GET /api/nodes]', error);
    return NextResponse.json({ error: 'Failed to load nodes.' }, { status: 500 });
  }
  return NextResponse.json({ nodes: data });
}

export async function POST(req: NextRequest) {
  // 10 requests per 60 seconds per IP
  if (!await rateLimit(getIp(req), 10, 60)) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const supabase = getSupabase();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { parent_id, song_title, artist, genre, year, album_art, itunes_url, preview_url, added_by, session_token } = body as {
    parent_id?: string; song_title: string; artist: string;
    genre?: string | null; year?: number | null;
    album_art?: string | null; itunes_url?: string | null; preview_url?: string | null;
    added_by: string; session_token?: string;
  };

  if (typeof session_token !== 'string' || session_token.trim().length === 0) {
    return NextResponse.json({ error: 'Missing session token.' }, { status: 400 });
  }

  const { data: allNodes, error: fetchError } = await supabase.from('music_nodes').select('*');

  if (fetchError) {
    console.error('[POST /api/nodes] fetch', fetchError);
    return NextResponse.json({ error: 'Failed to load nodes.' }, { status: 500 });
  }

  const nodes: MusicNode[] = allNodes || [];

  // Prevent same session adding two nodes in a row
  if (nodes.length > 0) {
    const lastNode = nodes.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );
    if (lastNode.session_token === session_token) {
      return NextResponse.json(
        { error: 'Someone else must add a song before you can add another.' },
        { status: 429 }
      );
    }
  }

  // Root node — only if tree is empty
  if (!parent_id) {
    if (nodes.length > 0) {
      return NextResponse.json({ error: 'Tree already has a root node.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('music_nodes')
      .insert({ song_title, artist, genre, year, album_art, itunes_url, preview_url, depth: 0, parent_id: null, added_by: added_by.trim(), session_token: session_token ?? null })
      .select()
      .single();
    if (error) {
      console.error('[POST /api/nodes] insert root', error);
      return NextResponse.json({ error: 'Failed to add root node.' }, { status: 500 });
    }
    return NextResponse.json({ node: data }, { status: 201 });
  }

  const parent = nodes.find(n => n.id === parent_id);
  if (!parent) return NextResponse.json({ error: 'Parent node not found.' }, { status: 404 });

  const similarity = checkSimilarity(
    parent.song_title, parent.artist, parent.genre, parent.year,
    song_title, artist, genre ?? null, year ?? null,
  );

  if (!similarity.matches) {
    return NextResponse.json({
      error: 'Song does not connect: it must share a word in the title, artist name, genre, or release year with the previous song.',
      similarity,
    }, { status: 400 });
  }

  // Reject if the song already appears in this chain (ancestor path)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const norm = (s: string) => s.toLowerCase().trim();
  const candidateKey = `${norm(song_title)}|||${norm(artist)}`;
  let ancestor: MusicNode | undefined = parent;
  let steps = 0;
  while (ancestor && steps < 50) {
    if (`${norm(ancestor.song_title)}|||${norm(ancestor.artist)}` === candidateKey) {
      return NextResponse.json({ error: 'This song already appears in this chain.' }, { status: 400 });
    }
    ancestor = ancestor.parent_id ? nodeMap.get(ancestor.parent_id) : undefined;
    steps++;
  }

  const { data, error } = await supabase
    .from('music_nodes')
    .insert({
      song_title,
      artist,
      genre,
      year,
      album_art,
      itunes_url,
      preview_url,
      parent_id,
      depth: parent.depth + 1,
      added_by: added_by.trim(),
      session_token: session_token ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/nodes] insert', error);
    // Surface duplicate-child error specifically so the client can give a useful message
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This song has already been added under this parent.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to add node.' }, { status: 500 });
  }
  return NextResponse.json({ node: data, similarity }, { status: 201 });
}
