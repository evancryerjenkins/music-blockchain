import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

function getSupabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

async function authenticate(
  req: NextRequest,
): Promise<{ supabase: SupabaseClient; user: User } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }
  const supabase = getSupabase(token);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from('notify_prefs')
    .select('email_on_new_node')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/notify-prefs]', error);
    return NextResponse.json({ error: 'Failed to load preferences.' }, { status: 500 });
  }
  // No row yet means the user has never opted in.
  return NextResponse.json({ enabled: data?.email_on_new_node ?? false });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { enabled } = body;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean.' }, { status: 400 });
  }
  // The address comes from the verified JWT, never from the request body.
  if (!auth.user.email) {
    return NextResponse.json({ error: 'Your account has no email address.' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('notify_prefs')
    .upsert(
      { user_id: auth.user.id, email: auth.user.email, email_on_new_node: enabled },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[PUT /api/notify-prefs]', error);
    return NextResponse.json({ error: 'Failed to save preferences.' }, { status: 500 });
  }
  return NextResponse.json({ enabled });
}
