import { createClient } from '@supabase/supabase-js';

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100; // Resend's per-call limit

interface Subscriber {
  email: string;
  unsubscribe_token: string;
}

// added_by is a user-supplied display name, so it reaches other people's
// inboxes untrusted. Escape everything interpolated into the HTML body.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

function buildEmail(sub: Subscriber, songTitle: string, artist: string, addedBy: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const unsubUrl = `${site}/api/unsubscribe?token=${sub.unsubscribe_token}`;
  const title = escapeHtml(songTitle);
  const by = escapeHtml(addedBy);
  const who = escapeHtml(artist);

  return {
    from: process.env.RESEND_FROM!,
    to: [sub.email],
    subject: `New link in the chain: ${songTitle} — ${artist}`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;line-height:1.5">` +
      `<p><strong>${by}</strong> just extended the chain.</p>` +
      `<p style="font-size:18px;margin:16px 0"><strong>${title}</strong><br>${who}</p>` +
      `<p><a href="${site}">See the tree</a></p>` +
      `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">` +
      `<p style="font-size:12px;color:#666">` +
      `You opted in to these emails. <a href="${unsubUrl}">Unsubscribe</a>.</p>` +
      `</div>`,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

// Email every opted-in user that a node was added, except the person who
// added it. Never throws — a mail failure must not fail the node insert.
export async function notifyNewNode(
  songTitle: string,
  artist: string,
  addedBy: string,
  excludeUserId: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return;
  if (!process.env.NEXT_PUBLIC_SITE_URL) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('notify_prefs')
    .select('email, unsubscribe_token')
    .eq('email_on_new_node', true)
    .neq('user_id', excludeUserId);

  if (error) {
    console.error('[notify] load subscribers', error);
    return;
  }
  if (!data?.length) return;

  // One addressed email per recipient rather than a shared BCC, so each
  // unsubscribe link is personal and addresses aren't leaked between users.
  const emails = (data as Subscriber[]).map(s => buildEmail(s, songTitle, artist, addedBy));

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const res = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emails.slice(i, i + BATCH_SIZE)),
    });
    if (!res.ok) {
      console.error('[notify] resend', res.status, await res.text().catch(() => ''));
      return;
    }
  }
}
