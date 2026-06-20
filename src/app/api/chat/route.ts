import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rateLimit';
import { getIp } from '@/lib/getIp';
import { moderateChat } from '@/lib/moderateChat';

function getSupabase(token?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined,
  );
}

function getToken(req: NextRequest): string | null {
  const h = req.headers.get('Authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function GET(req: NextRequest) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: 'Login required.' }, { status: 401 });

  const supabase = getSupabase(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, user_id, display_name, message, created_at')
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[GET /api/chat]', error);
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }
  return NextResponse.json({ messages: data });
}

export async function POST(req: NextRequest) {
  // IP-based rate limit: 20 requests per minute as a spam firewall
  if (!await rateLimit(getIp(req), 20, 60)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const token = getToken(req);
  if (!token) return NextResponse.json({ error: 'You must be logged in to chat.' }, { status: 401 });

  const supabase = getSupabase(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });

  // Per-user rate limit: 1 message per 5 seconds
  if (!await rateLimit(`chat:${user.id}`, 1, 5)) {
    return NextResponse.json({ error: 'Please wait a moment before sending another message.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const raw = body.message;
  if (typeof raw !== 'string') return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  const message = raw.trim();
  if (message.length === 0 || message.length > 500) {
    return NextResponse.json({ error: 'Message must be between 1 and 500 characters.' }, { status: 400 });
  }

  const modError = moderateChat(message);
  if (modError) return NextResponse.json({ error: modError }, { status: 400 });

  const displayName: string =
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    user.email ||
    'Unknown';

  const { error } = await supabase
    .from('chat_messages')
    .insert({ user_id: user.id, display_name: displayName, message });

  if (error) {
    console.error('[POST /api/chat]', error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
