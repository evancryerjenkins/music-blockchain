'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MusicNode } from '@/lib/types';
import StatsPanel from './StatsPanel';

interface Props {
  session: Session | null;
  nodes: MusicNode[];
  onShowAuth: () => void;
}

const UM_WIDTH = 200;

export default function UserMenu({ session, nodes, onShowAuth }: Props) {
  const [open, setOpen] = useState(false);
  const [statsMode, setStatsMode] = useState<'user' | 'chain' | null>(null);
  const [arrowY, setArrowY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !statsMode) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setStatsMode(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, statsMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setStatsMode(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) {
    return (
      <button className="stats-btn" onClick={onShowAuth}>log in</button>
    );
  }

  const displayName = session.user.user_metadata?.display_name ?? session.user.email ?? 'Account';
  const userId = session.user.id;
  const userNodes = nodes.filter(n => n.user_id ? n.user_id === userId : n.added_by === displayName);

  const computeArrowY = (el: Element): number => {
    if (!panelRef.current) return 40;
    const pr = panelRef.current.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return er.top + er.height / 2 - pr.top;
  };

  const handleStatItem = (mode: 'user' | 'chain', el: Element) => {
    setArrowY(computeArrowY(el));
    setStatsMode(prev => prev === mode ? null : mode);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="stats-btn"
        onClick={() => { setOpen(o => !o); setStatsMode(null); }}
      >
        {displayName}
      </button>

      {open && (
        <div className="um-panel" ref={panelRef}>
          <div className="sp-head">
            <span className="sp-eyebrow">Account</span>
            <button className="modal-close" onClick={() => { setOpen(false); setStatsMode(null); }}>×</button>
          </div>
          <div className="um-body">
            <button
              className={'um-item' + (statsMode === 'user' ? ' um-item-active' : '')}
              onClick={e => handleStatItem('user', e.currentTarget)}
            >
              User Stats
            </button>
            <button
              className={'um-item' + (statsMode === 'chain' ? ' um-item-active' : '')}
              onClick={e => handleStatItem('chain', e.currentTarget)}
            >
              Blockchain Stats
            </button>
            <div className="um-divider" />
            <button
              className="um-item um-item-muted"
              onClick={() => {
                setOpen(false);
                setStatsMode(null);
                import('@/lib/supabase').then(({ supabase }) => supabase.auth.signOut());
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {statsMode === 'chain' && (
        <StatsPanel
          title="Blockchain Statistics"
          nodes={nodes}
          panelStyle={{ right: UM_WIDTH + 12 }}
          arrowY={arrowY}
          onClose={() => setStatsMode(null)}
        />
      )}
      {statsMode === 'user' && (
        <StatsPanel
          title="Your Statistics"
          nodes={userNodes}
          panelStyle={{ right: UM_WIDTH + 12 }}
          arrowY={arrowY}
          contributionCount={userNodes.length}
          onClose={() => setStatsMode(null)}
        />
      )}
    </div>
  );
}
