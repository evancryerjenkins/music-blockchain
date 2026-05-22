'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'music-blockchain-welcomed';

interface Page {
  main: number;
  alive: number;
  dead: number;
  text: string;
  spotify?: boolean;
}

const PAGES: Page[] = [
  {
    main: 1, alive: 1, dead: 1,
    text: 'A collaborative game where everyone builds a single growing chain of songs — each one connected to the last.',
  },
  {
    main: 1, alive: 0.08, dead: 0.08,
    text: 'The main chain is the longest path. Each song must connect to its parent via a shared title word, artist name, genre, or release year.',
  },
  {
    main: 0.08, alive: 1, dead: 0.08,
    text: 'Anyone can fork from the main chain and start a branch. It stays alive while it remains close enough to the head to extend.',
  },
  {
    main: 0.08, alive: 0.08, dead: 1,
    text: 'Fall too far behind and the branch goes dead — frozen in the record, visible but no longer in play.',
  },
  {
    main: 1, alive: 1, dead: 1,
    text: 'The tree grows in real time. Every song appears the moment it\'s added, for all connected players.',
  },
  {
    main: 0, alive: 0, dead: 0, spotify: true,
    text: 'Every song added to the main chain is collected in a live Spotify playlist — updated automatically as the chain grows.',
  },
];

const TR = { transition: 'opacity 480ms ease' } as const;

export default function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  const P = PAGES[page];
  const isFirst = page === 0;
  const isFinal = page === PAGES.length - 1;

  return (
    <div className={'wc-backdrop ' + (visible ? 'wc-visible' : '')} onClick={onDismiss}>
      <div className="wc-panel" onClick={e => e.stopPropagation()}>

        {/* SVG diagram */}
        <div className="wc-svg-wrap">
          {P.spotify ? (
            <svg viewBox="0 0 420 190" className="wc-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              {/* Spotify circle logo */}
              <circle cx="210" cy="88" r="52" fill="#1DB954"/>
              {/* Three sound-wave arcs */}
              <path d="M 178 72 Q 210 58 242 72" stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"/>
              <path d="M 184 88 Q 210 77 236 88" stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"/>
              <path d="M 191 104 Q 210 96 229 104" stroke="white" strokeWidth="5.5" strokeLinecap="round" fill="none"/>

            </svg>
          ) : (
            <svg viewBox="0 0 420 190" className="wc-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">

              {/* ── Main chain ── */}
              <g style={{ opacity: P.main, ...TR }}>
                <text x="190" y="15" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="8" fill="var(--accent)" letterSpacing="2.5">MAIN BRANCH</text>
                <line x1="43"  y1="80" x2="97"  y2="80" stroke="var(--ink)" strokeWidth="1.5"/>
                <line x1="123" y1="80" x2="175" y2="80" stroke="var(--ink)" strokeWidth="1.5"/>
                <line x1="201" y1="80" x2="253" y2="80" stroke="var(--ink)" strokeWidth="1.5"/>
                <line x1="279" y1="80" x2="334" y2="80" stroke="var(--ink)" strokeWidth="1.5"/>
                <rect x="21" y="69" width="22" height="22" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
                <circle cx="110" cy="80" r="13" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
                <circle cx="188" cy="80" r="13" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
                <circle cx="266" cy="80" r="13" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
                <circle cx="348" cy="80" r="14" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
                <circle cx="348" cy="80" r="22" stroke="var(--accent)" strokeWidth="1" fill="none" className="wc-head-ring"/>
              </g>

              {/* ── Alive branch ── */}
              <g style={{ opacity: P.alive, ...TR }}>
                <text x="293" y="129" fontFamily="ui-monospace,monospace" fontSize="8" fill="var(--ink)" letterSpacing="2">ALIVE</text>
                <path d="M 110 93 C 110 116 149 128 188 128" stroke="var(--ink)" strokeWidth="1" fill="none"/>
                <line x1="199" y1="128" x2="255" y2="128" stroke="var(--ink)" strokeWidth="1"/>
                <circle cx="188" cy="128" r="11" stroke="var(--ink)" strokeWidth="1" fill="var(--bg)"/>
                <circle cx="266" cy="128" r="11" stroke="var(--ink)" strokeWidth="1" fill="var(--bg)"/>
              </g>

              {/* ── Dead branch ── */}
              <g style={{ opacity: P.dead, ...TR }}>
                <text x="149" y="182" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="8" fill="var(--dead)" letterSpacing="2">DEAD</text>
                <path d="M 32 91 C 32 130 71 162 110 162" stroke="var(--dead)" strokeWidth="1" strokeDasharray="4 3" fill="none"/>
                <line x1="121" y1="162" x2="177" y2="162" stroke="var(--dead)" strokeWidth="1" strokeDasharray="4 3"/>
                <circle cx="110" cy="162" r="11" stroke="var(--dead)" strokeWidth="1" fill="var(--dead-bg)"/>
                <circle cx="188" cy="162" r="11" stroke="var(--dead)" strokeWidth="1" fill="var(--dead-bg)"/>
              </g>

            </svg>
          )}
        </div>

        {/* Text */}
        <div className="wc-text-area">
          <p key={page} className="wc-text">{P.text}</p>
        </div>

        {/* Nav */}
        <div className="wc-nav">
          {!isFirst
            ? <button className="wc-arrow" onClick={() => setPage(p => p - 1)} aria-label="Previous">←</button>
            : <span />
          }
          {isFinal
            ? <button className="wc-get-started" onClick={onDismiss}>Get started →</button>
            : <button className="wc-arrow" onClick={() => setPage(p => p + 1)} aria-label="Next">→</button>
          }
        </div>

      </div>
    </div>
  );
}

export function useFirstVisit(): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setShow(false);
  };

  return { show, dismiss };
}
