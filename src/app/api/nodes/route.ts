import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkSimilarity } from '@/lib/similarity';
import { MusicNode } from '@/lib/types';

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ nodes: data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { parent_id, song_title, artist, genre, year, album_art, itunes_url, preview_url } = body;

  const { data: allNodes, error: fetchError } = await supabase
    .from('music_nodes')
    .select('*');

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const nodes: MusicNode[] = allNodes || [];

  // Root node — only if tree is empty
  if (!parent_id) {
    if (nodes.length > 0) {
      return NextResponse.json({ error: 'Tree already has a root node.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('music_nodes')
      .insert({ song_title, artist, genre, year, album_art, itunes_url, preview_url, depth: 0, parent_id: null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ node: data, similarity }, { status: 201 });
}
