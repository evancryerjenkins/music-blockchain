'use client';

import { useState, useEffect, useRef } from 'react';
import { ItunesTrack, SimilarityReason } from '@/lib/types';
import { checkSimilarity } from '@/lib/similarity';

interface RawNode {
  id: string;
  parent: string | null;
  t: string;
  a: string;
  g: string;
  y: number | null;
}

interface PlusNode {
  id: string;
  parent: string;
  kind: 'extend-main' | 'fork-main' | 'extend-branch' | 'fork-branch';
  forkLag?: number;
}

interface AddResult {
  track: ItunesTrack & { year: number | null };
  reasons: SimilarityReason[];
  link: SimilarityReason;
}

interface Props {
  plus: PlusNode;
  parent: RawNode;
  ancestorSongs: { t: string; a: string }[];
  onClose: () => void;
  onAdd: (result: AddResult) => void;
}

const norm = (s: string) => s.toLowerCase().trim();

export default function AddSongModal({ plus, parent, ancestorSongs, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(ItunesTrack & { year: number | null })[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<(ItunesTrack & { year: number | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?term=${encodeURIComponent(query)}`);
        const data = await res.json();
        const tracks = (data.results || []).map((t: ItunesTrack) => ({
          ...t,
          year: t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
        }));
        setResults(tracks);
        setError(null);
      } catch {
        setError('Search failed — check your connection and try again.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const kindLabel =
    plus.kind === 'extend-main'  ? 'Extend main' :
    plus.kind === 'fork-main'    ? 'Fork from main' :
    plus.kind === 'fork-branch'  ? 'Fork from branch' :
    'Extend branch';

  const getSimilarity = (track: ItunesTrack & { year: number | null }) =>
    checkSimilarity(parent.t, parent.a, parent.g || null, parent.y, track.trackName, track.artistName, track.primaryGenreName || null, track.year);

  const similarity = selected ? getSimilarity(selected) : null;
  const canAdd = !!selected && (similarity?.matches ?? false);

  function handleAdd() {
    if (!canAdd || !selected || !similarity) return;
    onAdd({ track: selected, reasons: similarity.reasons, link: similarity.reasons[0] });
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              <span className="tag-accent">{kindLabel}</span>
              <span>·</span>
              <span>after <b style={{ color: 'var(--ink)' }}>{parent.id.slice(0, 8).toUpperCase()}</b></span>
            </div>
            <h2>Add a song to the chain</h2>
            <div className="sub">Continuing from <b>{parent.t}</b> by {parent.a}.</div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="modal-rules">
          <span className="lbl">Rule</span>
          Must share a <b>title word</b>, <b>artist</b>, <b>genre</b>, or <b>release year</b> with the parent.
        </div>

        <div className="modal-search">
          <span className="icon">
            <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="9.4" y1="9.4" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search for a song or artist…"
          />
          {searching && <span className="searching">Searching</span>}
        </div>

        <div className="modal-results">
          {query.trim().length < 2 && (
            <div className="modal-empty">
              Search for a song that connects to <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{parent.t}</b>.
            </div>
          )}
          {query.trim().length >= 2 && !searching && results.length === 0 && !error && (
            <div className="modal-empty">No results.</div>
          )}

          {results.map(track => {
            const sim = getSimilarity(track);
            const inChain = ancestorSongs.some(
              s => norm(s.t) === norm(track.trackName) && norm(s.a) === norm(track.artistName)
            );
            const pass = sim.matches && !inChain;
            const isChosen = selected?.trackId === track.trackId;
            const cls = 'result ' + (pass ? 'pass ' : 'fail ') + (isChosen ? 'selected' : '');
            return (
              <button
                key={track.trackId}
                className={cls}
                disabled={!pass}
                onClick={() => setSelected(isChosen ? null : track)}
              >
                {track.artworkUrl100
                  ? <span className="art"><img src={track.artworkUrl100} alt="" /></span>
                  : <span className="art-fallback">♪</span>}
                <span className="info">
                  <span className="t">{track.trackName}</span>
                  <span className="a">{track.artistName} · {track.primaryGenreName} · {track.year ?? '—'}</span>
                </span>
                <span className="badge">{inChain ? 'in chain' : pass ? 'link' : 'no link'}</span>
              </button>
            );
          })}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-foot">
          {selected && similarity?.matches && (
            <div className="reasons pass">
              <span className="lbl">Connection</span>
              <ul>{similarity.reasons.map((r, i) => <li key={i}>{r.label}</li>)}</ul>
            </div>
          )}
          {selected && similarity && !similarity.matches && (
            <div className="reasons fail">
              <span className="lbl">No connection</span>
              &ldquo;{selected.trackName}&rdquo; shares no title word, artist, genre, or year with &ldquo;{parent.t}&rdquo;.
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canAdd} onClick={handleAdd}>
              {plus.kind === 'extend-main' ? 'Add to main' : (plus.kind === 'fork-main' || plus.kind === 'fork-branch') ? 'Fork here' : 'Add to branch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
