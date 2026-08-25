import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Reached from a link in an email, so there is no session — the opaque token
// is the credential. Uses the service role key to bypass RLS.
async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await supabase
    .from('notify_prefs')
    .update({ email_on_new_node: false })
    .eq('unsubscribe_token', token)
    .select('user_id');

  if (error) {
    console.error('[unsubscribe]', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

function page(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribe</title>` +
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:80px auto;line-height:1.5">` +
    `<p>${message}</p>` +
    `<p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? '/'}">Back to the tree</a></p></div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get('token'));
  return page(ok
    ? "You're unsubscribed. You won't get any more emails about new songs."
    : 'That unsubscribe link is not valid. It may have already been used.');
}

// RFC 8058 one-click unsubscribe, used by the List-Unsubscribe-Post header.
export async function POST(req: NextRequest) {
  await unsubscribe(req.nextUrl.searchParams.get('token'));
  return new NextResponse(null, { status: 200 });
}
