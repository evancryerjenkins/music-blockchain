import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkSimilarity } from '@/lib/similarity';
import { MusicNode } from '@/lib/types';
import { rateLimit } from '@/lib/rateLimit';
import { getIp } from '@/lib/getIp';
import { acquireSessionLock, releaseSessionLock } from '@/lib/sessionLock';
import { lookupAndSaveSpotifyUri, syncSpotifyPlaylist } from '@/lib/spotify';

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
  const { song_title, artist, genre, year, album_art, itunes_url, preview_url } = body;
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
  return null;
}

function getSupabase(token?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined,
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

  // Verify auth
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'You must be logged in to add songs.' }, { status: 401 });
  }

  const supabase = getSupabase(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired session. Please log in again.' }, { status: 401 });
  }

  const userId = user.id;
  const addedBy: string = (user.user_metadata?.display_name as string | undefined)?.trim() || user.email || 'Unknown';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { parent_id, song_title, artist, genre, year, album_art, itunes_url, preview_url } = body as {
    parent_id?: string; song_title: string; artist: string;
    genre?: string | null; year?: number | null;
    album_art?: string | null; itunes_url?: string | null; preview_url?: string | null;
  };

  if (!await acquireSessionLock(userId)) {
    return NextResponse.json({ error: 'Another submission from this session is in progress.' }, { status: 429 });
  }

  try {

  const { data: allNodes, error: fetchError } = await supabase.from('music_nodes').select('*');

  if (fetchError) {
    console.error('[POST /api/nodes] fetch', fetchError);
    return NextResponse.json({ error: 'Failed to load nodes.' }, { status: 500 });
  }

  const nodes: MusicNode[] = allNodes || [];

  // Prevent same user adding two nodes in a row
  if (nodes.length > 0) {
    const lastNode = nodes.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );
    if (lastNode.session_token === userId) {
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
      .insert({ song_title, artist, genre, year, album_art, itunes_url, preview_url, depth: 0, parent_id: null, added_by: addedBy, session_token: userId, user_id: userId })
      .select()
      .single();
    if (error) {
      console.error('[POST /api/nodes] insert root', error);
      return NextResponse.json({ error: 'Failed to add root node.' }, { status: 500 });
    }
    await lookupAndSaveSpotifyUri(data.id, song_title, artist).then(() => syncSpotifyPlaylist()).catch(e => console.error('[spotify sync]', e));
    return NextResponse.json({ node: data }, { status: 201 });
  }

  const parent = nodes.find(n => n.id === parent_id);
  if (!parent) return NextResponse.json({ error: 'Parent node not found.' }, { status: 404 });

  if (parent.depth >= 500) {
    return NextResponse.json({ error: 'Maximum chain depth reached.' }, { status: 400 });
  }

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

  // Reject if the song already exists anywhere in the tree
  const norm = (s: string) => s.toLowerCase().trim();
  const candidateKey = `${norm(song_title)}|||${norm(artist)}`;
  if (nodes.some(n => `${norm(n.song_title)}|||${norm(n.artist)}` === candidateKey)) {
    return NextResponse.json({ error: 'This song is already in the tree.' }, { status: 400 });
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
      added_by: addedBy,
      session_token: userId,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/nodes] insert', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This song has already been added under this parent.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to add node.' }, { status: 500 });
  }
  await lookupAndSaveSpotifyUri(data.id, song_title, artist).then(() => syncSpotifyPlaylist()).catch(e => console.error('[spotify sync]', e));
  return NextResponse.json({ node: data, similarity }, { status: 201 });

  } finally {
    await releaseSessionLock(userId);
  }
}
