import type { User } from '@supabase/supabase-js';

/**
 * The name shown publicly beside a user's contributions.
 *
 * Email/password signup requires a display_name, but Google OAuth supplies
 * only full_name/name — so this must never fall back to the email address.
 * Both music_nodes.added_by and chat_messages.display_name are world-readable,
 * and a value written there is public permanently.
 *
 * Returns null when the user has not chosen a name yet; callers prompt for
 * one (client) or refuse the write (server) rather than inventing a value.
 */
export function publicDisplayName(user: User | null | undefined): string | null {
  const raw = user?.user_metadata?.display_name;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Google gives us a name we can offer as the default in the prompt. */
export function suggestedDisplayName(user: User | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  for (const key of ['full_name', 'name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 100);
  }
  return '';
}
