'use client';

import { useState, useEffect, useRef } from 'react';

const TABS = ['The Chain', 'Connections', 'Branches', 'Get Started'] as const;
type Tab = typeof TABS[number];

const STORAGE_KEY = 'music-blockchain-welcomed';

interface Props {
  onDismiss: () => void;
}

function ChainDiagram() {
  const nodes = [
    { label: 'Bohemian\nRhapsody', sub: 'Queen' },
    { label: 'Rhapsody\nin Blue', sub: 'Gershwin' },
    { label: 'Blue\nMonday', sub: 'New Order' },
    { label: 'Monday\nMorning', sub: 'Fleetwood Mac' },
  ];
  const links = ['title: "Rhapsody"', 'title: "Blue"', 'title: "Monday"'];

  return (
    <div className="wc-chain-diagram">
      {nodes.map((n, i) => (
        <div key={i} className="wc-chain-row">
          <div className="wc-chain-node">
            <div className="wc-chain-circle">
              <span>{i + 1}</span>
            </div>
            <div className="wc-chain-info">
              <div className="wc-chain-title">{n.label.replace('\n', ' ')}</div>
              <div className="wc-chain-sub">{n.sub}</div>
            </div>
          </div>
          {i < links.length && (
            <div className="wc-chain-link">
              <div className="wc-chain-link-line" />
              <div className="wc-chain-link-tag">{links[i]}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConnectionsTab() {
  const conns = [
    {
      kind: 'Title Word',
      desc: 'A significant word appears in both song titles.',
      eg: '"Blue Monday" → "Blue Suede Shoes"',
      tag: 'title',
    },
    {
      kind: 'Artist Name',
      desc: 'A word from the artist name appears in the next artist name.',
      eg: '"New Order" → "Order of Operations"',
      tag: 'artist',
    },
    {
      kind: 'Genre',
      desc: 'Both songs share the same genre (or one contains the other).',
      eg: '"Rock" → "Indie Rock"',
      tag: 'genre',
    },
    {
      kind: 'Release Year',
      desc: 'Both songs were released in the exact same year.',
      eg: '"1991 — 1991"',
      tag: 'year',
    },
  ];

  return (
    <div className="wc-conns">
      {conns.map(c => (
        <div key={c.kind} className="wc-conn-card">
          <div className="wc-conn-tag">{c.tag}</div>
          <div className="wc-conn-kind">{c.kind}</div>
          <div className="wc-conn-desc">{c.desc}</div>
          <div className="wc-conn-eg">{c.eg}</div>
        </div>
      ))}
    </div>
  );
}

function BranchesTab() {
  return (
    <div className="wc-branches">
      <div className="wc-branches-diagram">
        <svg viewBox="0 0 340 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Main chain */}
          <line x1="20" y1="60" x2="100" y2="60" stroke="var(--ink)" strokeWidth="1.5"/>
          <line x1="100" y1="60" x2="180" y2="60" stroke="var(--ink)" strokeWidth="1.5"/>
          <line x1="180" y1="60" x2="260" y2="60" stroke="var(--ink)" strokeWidth="1.5"/>
          <line x1="260" y1="60" x2="320" y2="60" stroke="var(--ink)" strokeWidth="1.5"/>
          <circle cx="20"  cy="60" r="12" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
          <circle cx="100" cy="60" r="12" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
          <circle cx="180" cy="60" r="12" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
          <circle cx="260" cy="60" r="12" stroke="var(--ink)" strokeWidth="1.5" fill="var(--bg)"/>
          <circle cx="320" cy="60" r="14" stroke="var(--accent)" strokeWidth="1.5" fill="var(--bg)"/>
          <circle cx="320" cy="60" r="20" stroke="var(--accent)" strokeWidth="1" fill="none" opacity="0.35"/>
          {/* Alive branch */}
          <path d="M100 60 Q140 60 160 100" stroke="var(--ink)" strokeWidth="1" fill="none"/>
          <line x1="160" y1="100" x2="240" y2="100" stroke="var(--ink)" strokeWidth="1"/>
          <circle cx="160" cy="100" r="10" stroke="var(--ink)" strokeWidth="1" fill="var(--bg)"/>
          <circle cx="240" cy="100" r="10" stroke="var(--ink)" strokeWidth="1" fill="var(--bg)"/>
          {/* Dead branch */}
          <path d="M20 60 Q40 60 60 130" stroke="var(--dead)" strokeWidth="1" strokeDasharray="4 3" fill="none"/>
          <line x1="60" y1="130" x2="140" y2="130" stroke="var(--dead)" strokeWidth="1" strokeDasharray="4 3"/>
          <circle cx="60"  cy="130" r="10" stroke="var(--dead)" strokeWidth="1" fill="var(--dead-bg)"/>
          <circle cx="140" cy="130" r="10" stroke="var(--dead)" strokeWidth="1" fill="var(--dead-bg)"/>
          {/* Labels */}
          <text x="175" y="24" fontFamily="ui-monospace, monospace" fontSize="8" fill="var(--accent)" letterSpacing="2" textAnchor="middle">MAIN CHAIN</text>
          <text x="200" y="92" fontFamily="ui-monospace, monospace" fontSize="8" fill="var(--ink)" letterSpacing="1.5" textAnchor="middle">ALIVE</text>
          <text x="100" y="150" fontFamily="ui-monospace, monospace" fontSize="8" fill="var(--dead)" letterSpacing="1.5" textAnchor="middle">DEAD</text>
        </svg>
      </div>
      <div className="wc-branch-cards">
        <div className="wc-branch-card main">
          <div className="wc-branch-label">Main chain</div>
          <div className="wc-branch-desc">The longest path from root. This is the leaderboard — everyone's trying to extend it.</div>
        </div>
        <div className="wc-branch-card alive">
          <div className="wc-branch-label">Alive branch</div>
          <div className="wc-branch-desc">A fork that's still close enough to the main head to matter. You can still extend it.</div>
        </div>
        <div className="wc-branch-card dead">
          <div className="wc-branch-label">Dead branch</div>
          <div className="wc-branch-desc">A fork that fell too far behind. It's frozen — part of the history but no longer in play.</div>
        </div>
      </div>
    </div>
  );
}

function GetStartedTab({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="wc-start">
      <div className="wc-start-steps">
        <div className="wc-step">
          <div className="wc-step-num">01</div>
          <div className="wc-step-body">
            <div className="wc-step-title">Find a "+" node</div>
            <div className="wc-step-desc">The main chain head, recent fork points, and alive branch tips all have dashed "+" buttons you can click.</div>
          </div>
        </div>
        <div className="wc-step">
          <div className="wc-step-num">02</div>
          <div className="wc-step-body">
            <div className="wc-step-title">Search for your song</div>
            <div className="wc-step-desc">Type into the search box. Results come from iTunes — covers, genres, and years are filled in automatically.</div>
          </div>
        </div>
        <div className="wc-step">
          <div className="wc-step-num">03</div>
          <div className="wc-step-body">
            <div className="wc-step-title">Pass the connection check</div>
            <div className="wc-step-desc">Your song needs at least one link to its parent — title word, artist, genre, or year. The checker tells you instantly.</div>
          </div>
        </div>
      </div>
      <div className="wc-start-hint">
        <span className="wc-hint-dot" />
        Hover any node to see its details and connection reason
        <span className="wc-hint-dot" />
        Drag to navigate
        <span className="wc-hint-dot" />
        Scroll to zoom
      </div>
      <button className="wc-cta" onClick={onDismiss}>Start exploring</button>
    </div>
  );
}

export default function WelcomeScreen({ onDismiss }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('The Chain');
  const [prevTab, setPrevTab] = useState<Tab | null>(null);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    onDismiss();
  };

  const goToTab = (tab: Tab) => {
    if (tab === activeTab) return;
    const newIdx = TABS.indexOf(tab);
    const curIdx = TABS.indexOf(activeTab);
    setDirection(newIdx > curIdx ? 'right' : 'left');
    setPrevTab(activeTab);
    setActiveTab(tab);
    setTimeout(() => setPrevTab(null), 260);
  };

  return (
    <div className={'wc-backdrop ' + (visible ? 'wc-visible' : '')}>
      <div className="wc-panel">
        {/* Header */}
        <div className="wc-head">
          <div className="wc-head-brand">
            <span className="wc-mark" />
            <div>
              <div className="wc-eyebrow">How it works</div>
              <div className="wc-head-title">Music Blockchain</div>
            </div>
          </div>
          <button className="wc-close" onClick={handleDismiss} aria-label="Close">&#215;</button>
        </div>

        {/* Tabs */}
        <div className="wc-tabs">
          {TABS.map(tab => (
            <button
              key={tab}
              className={'wc-tab ' + (tab === activeTab ? 'active' : '')}
              onClick={() => goToTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="wc-body">
          <div
            key={activeTab}
            className={'wc-content wc-slide-' + direction}
          >
            {activeTab === 'The Chain' && (
              <div>
                <p className="wc-lead">
                  Music Blockchain is a collaborative game where every song added must share a connection with the one before it. Together, everyone builds a single growing chain — and every fork tells a story.
                </p>
                <ChainDiagram />
                <p className="wc-caption">
                  Each song is a block. Each block must connect to its parent via a shared word, artist, genre, or year. The chain is live — new songs appear for everyone in real time.
                </p>
              </div>
            )}
            {activeTab === 'Connections' && <ConnectionsTab />}
            {activeTab === 'Branches' && <BranchesTab />}
            {activeTab === 'Get Started' && <GetStartedTab onDismiss={handleDismiss} />}
          </div>
        </div>

        {/* Footer nav */}
        <div className="wc-foot">
          <button
            className="wc-nav-btn"
            disabled={activeTab === TABS[0]}
            onClick={() => goToTab(TABS[TABS.indexOf(activeTab) - 1])}
          >
            ← Back
          </button>
          <div className="wc-dots">
            {TABS.map(tab => (
              <button
                key={tab}
                className={'wc-dot ' + (tab === activeTab ? 'active' : '')}
                onClick={() => goToTab(tab)}
                aria-label={tab}
              />
            ))}
          </div>
          {activeTab === TABS[TABS.length - 1] ? (
            <button className="wc-nav-btn wc-nav-dismiss" onClick={handleDismiss}>
              Let's go →
            </button>
          ) : (
            <button
              className="wc-nav-btn"
              onClick={() => goToTab(TABS[TABS.indexOf(activeTab) + 1])}
            >
              Next →
            </button>
          )}
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
