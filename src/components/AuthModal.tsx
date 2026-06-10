'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  onSuccess: () => void;
  onClose: () => void;
}

export default function AuthModal({ onSuccess, onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) { setError('Display name is required.'); setLoading(false); return; }
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (err) { setError(err.message); return; }
        onSuccess();
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); return; }
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-head">
          <div>
            <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
            <div className="sub" style={{ marginTop: 2 }}>
              {mode === 'login' ? 'Log in to add songs to the chain.' : 'Create an account to start contributing.'}
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <div className="modal-name">
              <label htmlFor="auth-display-name">Display name</label>
              <input
                id="auth-display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How you'll appear on the tree…"
                maxLength={100}
                required
                autoFocus
              />
            </div>
          )}
          <div className="modal-name">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus={mode === 'login'}
            />
          </div>
          <div className="modal-name">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Password'}
              minLength={6}
              required
            />
          </div>

          {error && <div className="modal-error" style={{ margin: '0' }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {mode === 'login' ? 'No account? ' : 'Already have an account? '}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(null); }}
              >
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
