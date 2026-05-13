'use client';

import { useRef, useState, useEffect } from 'react';
import { MusicNode } from '@/lib/types';

const MAX_DEPTH = 3;

interface Props {
  node: MusicNode;
  parentNode: MusicNode | null;
  childCount: number;
  onAddAfter: () => void;
  onClose: () => void;
  connectionReasons?: string[];
}

export default function NodeInfoPanel({ node, parentNode, childCount, onAddAfter, onClose, connectionReasons }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const isLocked = node.depth >= MAX_DEPTH;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setProgress((audio.currentTime / audio.duration) * 100 || 0);
    const onEnded = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  const depthLabel = ['Seed', '1st Branch', '2nd Branch', '3rd Branch'];

  return (
    <div className="info-panel glass-card rounded-2xl overflow-hidden w-80 flex flex-col"
      style={{ border: '1px solid rgba(139,92,246,0.25)', maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Album art header */}
      <div className="relative h-36 flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a0a3e, #0d0d24)' }}>
        {node.album_art ? (
          <img
            src={node.album_art}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.5, filter: 'blur(8px)', transform: 'scale(1.1)' }}
          />
        ) : null}
        <div className="absolute inset-0 flex items-center gap-4 p-4">
          {node.album_art ? (
            <img src={node.album_art} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }} />
          ) : (
            <div className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.3)' }}>♪</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium mb-1" style={{ color: '#8B5CF6' }}>{depthLabel[node.depth] ?? 'Branch'}</p>
            <h3 className="font-bold text-sm leading-tight mb-0.5 line-clamp-2" style={{ color: '#f0f0ff', fontFamily: 'Space Grotesk, sans-serif' }}>
              {node.song_title}
            </h3>
            <p className="text-xs" style={{ color: '#9090cc' }}>{node.artist}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-sm hover:bg-white/10 transition-colors"
          style={{ color: '#9090cc' }}
        >×</button>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Meta pills */}
        <div className="flex flex-wrap gap-2">
          {node.genre && (
            <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              {node.genre}
            </span>
          )}
          {node.year && (
            <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.25)' }}>
              {node.year}
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: isLocked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: isLocked ? '#f87171' : '#34d399', border: `1px solid ${isLocked ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
            {isLocked ? '🔒 Locked' : `${childCount} branch${childCount !== 1 ? 'es' : ''}`}
          </span>
        </div>

        {/* Connection from parent */}
        {parentNode && connectionReasons && connectionReasons.length > 0 && (
          <div className="p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: '#34d399' }}>Connected from &ldquo;{parentNode.song_title}&rdquo;</p>
            {connectionReasons.map(r => (
              <p key={r} className="text-xs" style={{ color: '#6ee7b7' }}>· {r}</p>
            ))}
          </div>
        )}

        {/* Audio preview */}
        {node.preview_url && (
          <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#a78bfa' }}>30-second preview</p>
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: playing ? '0 0 16px rgba(139,92,246,0.6)' : '0 0 8px rgba(139,92,246,0.3)' }}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(139,92,246,0.2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #7C3AED, #06B6D4)' }} />
              </div>
            </div>
            <audio ref={audioRef} src={node.preview_url} preload="none" />
          </div>
        )}

        {/* iTunes link */}
        {node.itunes_url && (
          <a
            href={node.itunes_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#7878a8', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            Open in Apple Music ↗
          </a>
        )}
      </div>

      {/* Add button */}
      {!isLocked && (
        <div className="p-4 border-t" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
          <button
            onClick={onAddAfter}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
              color: '#fff',
              boxShadow: '0 0 20px rgba(139,92,246,0.4)',
            }}
          >
            Add a song after this ✦
          </button>
        </div>
      )}
    </div>
  );
}
