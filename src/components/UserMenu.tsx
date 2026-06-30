'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MusicNode } from '@/lib/types';
import StatsPanel from './StatsPanel';
import DarkerModeOverlay from './DarkerModeOverlay';

interface Props {
  session: Session | null;
  nodes: MusicNode[];
  onShowAuth: () => void;
  onHighlightMyNodesChange: (value: boolean) => void;
}

const UM_WIDTH = 200;

export default function UserMenu({ session, nodes, onShowAuth, onHighlightMyNodesChange }: Props) {
  const [open, setOpen] = useState(false);
  const [statsMode, setStatsMode] = useState<'user' | 'chain' | null>(null);
  const [arrowY, setArrowY] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsArrowY, setPrefsArrowY] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [darkerMode, setDarkerMode] = useState(false);
  const [highlightMyNodes, setHighlightMyNodes] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load preferences on mount
  useEffect(() => {
    const saved = localStorage.getItem('darkMode') === 'true';
    if (saved) {
      setDarkMode(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    const savedHighlight = localStorage.getItem('highlightMyNodes') === 'true';
    if (savedHighlight) {
      setHighlightMyNodes(true);
      onHighlightMyNodesChange(true);
    }
  }, []);

  useEffect(() => {
    if (!open && !statsMode && !prefsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setStatsMode(null);
        setPrefsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, statsMode, prefsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setStatsMode(null); setPrefsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(d => {
      const next = !d;
      if (next) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem('darkMode', String(next));
      return next;
    });
  };

  const toggleHighlightMyNodes = () => {
    setHighlightMyNodes(h => {
      const next = !h;
      localStorage.setItem('highlightMyNodes', String(next));
      onHighlightMyNodesChange(next);
      return next;
    });
  };

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
    setPrefsOpen(false);
  };

  const handlePrefsItem = (el: Element) => {
    setPrefsArrowY(computeArrowY(el));
    setPrefsOpen(prev => !prev);
    setStatsMode(null);
  };

  return (
    <>
    {darkerMode && <DarkerModeOverlay />}
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="stats-btn"
        onClick={() => { setOpen(o => !o); setStatsMode(null); setPrefsOpen(false); }}
      >
        {displayName}
      </button>

      {open && (
        <div className="um-panel" ref={panelRef}>
          <div className="sp-head">
            <span className="sp-eyebrow">Account</span>
            <button className="modal-close" onClick={() => { setOpen(false); setStatsMode(null); setPrefsOpen(false); }}>×</button>
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
            <button
              className={'um-item' + (prefsOpen ? ' um-item-active' : '')}
              onClick={e => handlePrefsItem(e.currentTarget)}
            >
              Preferences
            </button>
            <div className="um-divider" />
            <button
              className="um-item um-item-muted"
              onClick={() => {
                setOpen(false);
                setStatsMode(null);
                setPrefsOpen(false);
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
      {prefsOpen && (
        <div className="sp-panel" style={{ right: UM_WIDTH + 12 }}>
          <div className="dp-arrow" style={{ top: prefsArrowY }} />
          <div className="sp-head">
            <span className="sp-eyebrow">Preferences</span>
            <button className="modal-close" onClick={() => setPrefsOpen(false)}>×</button>
          </div>
          <div className="sp-body">
            <div className="sp-section">
              <div className="pref-row">
                <span className="pref-label">Dark mode</span>
                <button
                  className={'pref-toggle' + (darkMode ? ' pref-toggle-on' : '')}
                  onClick={toggleDarkMode}
                  aria-label={darkMode ? 'Disable dark mode' : 'Enable dark mode'}
                />
              </div>
              <div className="pref-row">
                <span className="pref-label">Darker mode</span>
                <button
                  className={'pref-toggle' + (darkerMode ? ' pref-toggle-on' : '')}
                  onClick={() => setDarkerMode(d => !d)}
                  aria-label={darkerMode ? 'Disable darker mode' : 'Enable darker mode'}
                />
              </div>
              <div className="pref-row">
                <span className="pref-label">Highlight my nodes</span>
                <button
                  className={'pref-toggle' + (highlightMyNodes ? ' pref-toggle-on' : '')}
                  onClick={toggleHighlightMyNodes}
                  aria-label={highlightMyNodes ? 'Disable node highlight' : 'Highlight my nodes'}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
