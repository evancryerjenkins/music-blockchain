'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { suggestedDisplayName } from '@/lib/displayName';

interface Props {
  user: User;
  onDone: () => void;
}

/**
 * Shown once to users who arrived via Google, who have no display_name.
 * Deliberately not dismissable: without a name we would have to write their
 * email address into the public tree, so signing out is the only way past it.
 */
export default function DisplayNamePrompt({ user, onDone }: Props) {
  const [name, setName] = useState(() => suggestedDisplayName(user));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Display name is required.'); return; }
    setError(null);
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (err) { setError(err.message); setSaving(false); return; }
    onDone();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-head">
          <div>
            <h2>Choose a display name</h2>
            <div className="sub" style={{ marginTop: 2 }}>
              This is how you&apos;ll appear beside the songs you add.
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="modal-name">
            <label htmlFor="dn-name">Display name</label>
            <input
              id="dn-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="How you'll appear on the tree…"
              maxLength={100}
              required
              autoFocus
            />
          </div>

          {error && <div className="modal-error" style={{ margin: 0 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="submit" className="auth-submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Continue'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Not you?{' '}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => supabase.auth.signOut()}
              >
                Sign out
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
