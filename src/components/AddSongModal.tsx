'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MusicNode, ItunesTrack } from '@/lib/types';
import { checkSimilarity } from '@/lib/similarity';

interface Props {
  parentNode: MusicNode | null;
  isRoot?: boolean;
  onClose: () => void;
  onAdded: (node: MusicNode) => void;
}

export default function AddSongModal({ parentNode, isRoot = false, onClose, onAdded }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ItunesTrack | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useCallback(async (term: string) => {
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?term=${encodeURIComponent(term)}`);
      const data = await res.json();
      setResults(data.results || []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 320);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const similarity = selected && parentNode
    ? checkSimilarity(
        parentNode,
        selected.trackName,
        selected.artistName,
        selected.primaryGenreName,
        selected.releaseDate ? new Date(selected.releaseDate).getFullYear() : null
      )
    : null;

  const canAdd = isRoot || (similarity?.matches ?? false);

  async function handleAdd() {
    if (!selected || !canAdd) return;
    setSubmitting(true);
    setError(null);
    try {
      const year = selected.releaseDate ? new Date(selected.releaseDate).getFullYear() : null;
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: parentNode?.id ?? null,
          song_title: selected.trackName,
          artist: selected.artistName,
          genre: selected.primaryGenreName || null,
          year,
          album_art: selected.artworkUrl100 || null,
          itunes_url: selected.trackViewUrl || null,
          preview_url: selected.previewUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add song.'); return; }
      onAdded(data.node);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,4,14,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-panel glass-card rounded-2xl w-full max-w-lg overflow-hidden"
        style={{ border: '1px solid rgba(139,92,246,0.3)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#e0e0ff' }}>
              {isRoot ? 'Plant the Seed 🌱' : 'Add a Song'}
            </h2>
            {parentNode && (
              <p className="text-sm mt-0.5" style={{ color: '#7878a8' }}>
                Continuing from <span style={{ color: '#a090e8' }}>{parentNode.song_title}</span> by {parentNode.artist}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:text-white transition-colors"
            style={{ color: '#5555aa' }}
          >
            ×
          </button>
        </div>

        {/* Rules reminder */}
        {!isRoot && (
          <div className="mx-5 mt-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(139,92,246,0.1)', color: '#9090cc', border: '1px solid rgba(139,92,246,0.2)' }}>
            Your song must share a <b style={{ color: '#c0b0ff' }}>title word</b>, <b style={{ color: '#c0b0ff' }}>artist</b>, <b style={{ color: '#c0b0ff' }}>genre</b>, or <b style={{ color: '#c0b0ff' }}>release year</b> with the previous one.
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg" style={{ color: '#5555aa' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Search for a song or artist…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all search-input"
              style={{
                background: 'rgba(13,13,40,0.8)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: '#e0e0ff',
              }}
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#7878a8' }}>
                Searching…
              </span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 pb-2" style={{ minHeight: 0 }}>
          {results.length > 0 && (
            <div className="space-y-1 py-1">
              {results.map(track => {
                const sim = parentNode
                  ? checkSimilarity(
                      parentNode,
                      track.trackName,
                      track.artistName,
                      track.primaryGenreName,
                      track.releaseDate ? new Date(track.releaseDate).getFullYear() : null
                    )
                  : null;
                const passes = isRoot || (sim?.matches ?? false);
                const isChosen = selected?.trackId === track.trackId;

                return (
                  <button
                    key={track.trackId}
                    onClick={() => setSelected(isChosen ? null : track)}
                    className="search-result w-full flex items-center gap-3 p-2.5 rounded-xl text-left"
                    style={{
                      background: isChosen ? 'rgba(139,92,246,0.2)' : 'transparent',
                      border: isChosen ? '1px solid rgba(139,92,246,0.5)' : '1px solid transparent',
                      opacity: (!isRoot && !passes) ? 0.45 : 1,
                      cursor: (!isRoot && !passes) ? 'not-allowed' : 'pointer',
                    }}
                    disabled={!isRoot && !passes}
                  >
                    {track.artworkUrl100 ? (
                      <img
                        src={track.artworkUrl100}
                        alt=""
                        className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                        style={{ boxShadow: passes ? `0 0 8px rgba(139,92,246,0.4)` : 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-xl"
                        style={{ background: 'rgba(139,92,246,0.2)' }}>♪</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#e0e0ff' }}>{track.trackName}</p>
                      <p className="text-xs truncate" style={{ color: '#7878a8' }}>
                        {track.artistName} · {track.primaryGenreName} · {track.releaseDate?.slice(0, 4)}
                      </p>
                    </div>
                    {!isRoot && sim && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: passes ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)',
                          color: passes ? '#34d399' : '#f87171',
                          border: `1px solid ${passes ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        {passes ? '✓' : '✗'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {query.length > 1 && !searching && results.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: '#5555aa' }}>No results found.</p>
          )}

          {query.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: '#5555aa' }}>
              {isRoot ? 'Search for any song to start the chain.' : 'Search for a song that connects.'}
            </p>
          )}
        </div>

        {/* Selected song + similarity */}
        {selected && (
          <div className="mx-5 mb-3">
            <div className="similarity-badge p-3 rounded-xl" style={{ background: 'rgba(13,13,40,0.9)', border: '1px solid rgba(139,92,246,0.3)' }}>
              <div className="flex items-center gap-3 mb-2">
                {selected.artworkUrl100 && (
                  <img src={selected.artworkUrl100} alt="" className="w-12 h-12 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: '#e0e0ff' }}>{selected.trackName}</p>
                  <p className="text-xs" style={{ color: '#7878a8' }}>{selected.artistName}</p>
                </div>
              </div>

              {!isRoot && similarity && (
                <div className="space-y-1">
                  {similarity.matches ? (
                    <>
                      <p className="text-xs font-medium" style={{ color: '#34d399' }}>✓ Connection found:</p>
                      {similarity.reasons.map(r => (
                        <p key={r} className="text-xs pl-3" style={{ color: '#6ee7b7' }}>· {r}</p>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs" style={{ color: '#f87171' }}>
                      ✗ No connection found. Must share a title word, artist, genre, or year with &ldquo;{parentNode?.song_title}&rdquo;.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mx-5 mb-3 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 p-5 border-t" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9090cc', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selected || !canAdd || submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: (selected && canAdd && !submitting) ? 'linear-gradient(135deg, #7C3AED, #4F46E5)' : 'rgba(80,60,140,0.2)',
              color: (selected && canAdd && !submitting) ? '#fff' : '#5555aa',
              cursor: (selected && canAdd && !submitting) ? 'pointer' : 'not-allowed',
              boxShadow: (selected && canAdd && !submitting) ? '0 0 20px rgba(139,92,246,0.4)' : 'none',
            }}
          >
            {submitting ? 'Adding…' : isRoot ? 'Plant this Song 🌱' : 'Add to Chain'}
          </button>
        </div>
      </div>
    </div>
  );
}
