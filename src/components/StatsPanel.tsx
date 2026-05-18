'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MusicNode } from '@/lib/types';

interface Props {
  nodes: MusicNode[];
  onClose: () => void;
}

function topN(values: (string | null)[], n: number): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v && v.trim()) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

function StatList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="sp-section">
      <div className="sp-section-title">{title}</div>
      {items.length === 0
        ? <div className="sp-empty">No data yet</div>
        : items.map(({ label, count }, i) => (
            <div key={label} className="sp-row">
              <span className="sp-rank">{i + 1}</span>
              <div className="sp-bar-wrap">
                <div className="sp-bar" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="sp-label" title={label}>{label}</span>
              <span className="sp-count">{count}</span>
            </div>
          ))
      }
    </div>
  );
}

function DecadeChart({ nodes }: { nodes: MusicNode[] }) {
  const data = useMemo(() => {
    const counts = new Map<number, number>();
    for (const n of nodes) {
      if (n.year && n.year > 1900 && n.year <= 2030) {
        const decade = Math.floor(n.year / 10) * 10;
        counts.set(decade, (counts.get(decade) ?? 0) + 1);
      }
    }
    if (counts.size === 0) return [];
    const keys = Array.from(counts.keys());
    const min = Math.min(...keys);
    const max = Math.max(...keys);
    const result = [];
    for (let d = min; d <= max; d += 10) {
      result.push({ decade: d, count: counts.get(d) ?? 0 });
    }
    return result;
  }, [nodes]);

  if (data.length === 0) {
    return (
      <div className="sp-section">
        <div className="sp-section-title">Songs by Decade</div>
        <div className="sp-empty">No data yet</div>
      </div>
    );
  }

  const chartW = 328;
  const chartH = 72;
  const barPad = 3;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barW = Math.floor((chartW - barPad) / data.length) - barPad;

  return (
    <div className="sp-section">
      <div className="sp-section-title">Songs by Decade</div>
      <svg
        className="sp-chart"
        width={chartW}
        height={chartH + 18}
        viewBox={`0 0 ${chartW} ${chartH + 18}`}
      >
        {data.map(({ decade, count }, i) => {
          const barH = count === 0 ? 1 : Math.max(2, (count / maxCount) * chartH);
          const x = i * (barW + barPad) + barPad;
          const y = chartH - barH;
          const label = `'${String(decade).slice(2)}`;
          return (
            <g key={decade}>
              <rect
                x={x} y={y}
                width={barW} height={barH}
                className={count === 0 ? 'sp-bar-decade sp-bar-decade-zero' : 'sp-bar-decade'}
              />
              <text
                x={x + barW / 2}
                y={chartH + 13}
                className="sp-decade-label"
                textAnchor="middle"
              >
                {label}
              </text>
              {count > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 3}
                  className="sp-decade-count"
                  textAnchor="middle"
                >
                  {count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StatsPanel({ nodes, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const genres      = useMemo(() => topN(nodes.map(n => n.genre), 5), [nodes]);
  const contributors = useMemo(() => topN(nodes.map(n => n.added_by), 5), [nodes]);
  const artists     = useMemo(() => topN(nodes.map(n => n.artist), 5), [nodes]);

  return (
    <div className="sp-panel" ref={ref}>
      <div className="sp-head">
        <span className="sp-eyebrow">Statistics</span>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="sp-body">
        <StatList title="Top Genres" items={genres} />
        <StatList title="Top Contributors" items={contributors} />
        <StatList title="Top Artists" items={artists} />
        <DecadeChart nodes={nodes} />
      </div>
    </div>
  );
}
