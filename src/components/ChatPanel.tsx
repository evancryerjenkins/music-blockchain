'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  message: string;
  created_at: string;
}

interface Props {
  session: Session | null;
  onShowAuth: () => void;
}

const MAX_MSG = 500;

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function ChatPanel({ session, onShowAuth }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch history when opened
  useEffect(() => {
    if (!open || !session) return;
    fetch('/api/chat', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.json())
      .then(data => { if (data.messages) setMessages(data.messages); })
      .catch(() => {});
  }, [open, session]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }, [open]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription (active whenever logged in, not just when panel is open)
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('chat_messages_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => setMessages(prev => [...prev, payload.new as ChatMessage]),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  const handleOpen = () => {
    if (!session) { onShowAuth(); return; }
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelStyle({ top: rect.bottom + 12, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  };

  const handleSend = async () => {
    if (!session || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: draft.trim() }),
      });
      if (res.ok) {
        setDraft('');
      } else {
        const data = await res.json();
        setSendError(data.error ?? 'Failed to send message.');
      }
    } finally {
      setSending(false);
    }
  };

  const charsLeft = MAX_MSG - draft.length;
  const showCounter = draft.length > MAX_MSG * 0.8;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button ref={buttonRef} className="stats-btn" onClick={handleOpen}>chat</button>

      {open && session && (
        <div className="chat-panel" style={panelStyle}>
          <div className="sp-head">
            <span className="sp-eyebrow">Global Chat</span>
            <button className="modal-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">No messages yet — say something.</div>
            )}
            {messages.map(m => (
              <div key={m.id} className="chat-message">
                <div className="chat-msg-header">
                  <span className="chat-msg-name">{m.display_name}</span>
                  <span className="chat-msg-time">{timeAgo(m.created_at)}</span>
                </div>
                <div className="chat-msg-body">{m.message}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {sendError && <div className="chat-error">{sendError}</div>}

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              placeholder="Message…"
              value={draft}
              maxLength={MAX_MSG}
              onChange={e => { setDraft(e.target.value); setSendError(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
            />
            <button
              className="chat-send"
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              aria-label="Send"
            >
              {sending ? '…' : '↑'}
            </button>
          </div>
          {showCounter && (
            <div className="chat-char-count" style={{ color: charsLeft < 20 ? 'var(--dead)' : 'var(--muted)' }}>
              {charsLeft}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
