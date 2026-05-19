'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MusicNode } from '@/lib/types';

interface Props {
  nodes: MusicNode[];
  onClose: () => void;
}

interface DetailState {
  type: 'genre' | 'artist' | 'contributor' | 'decade';
  value: string | number;
  arrowY: number;
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

function StatList({
  title,
  items,
  activeLabel,
  onItemClick,
}: {
  title: string;
  items: { label: string; count: number }[];
  activeLabel?: string;
  onItemClick: (label: string, el: Element) => void;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="sp-section">
      <div className="sp-section-title">{title}</div>
      {items.length === 0
        ? <div className="sp-empty">No data yet</div>
        : items.map(({ label, count }, i) => (
            <div
              key={label}
              className={`sp-row sp-row-btn${activeLabel === label ? ' sp-row-active' : ''}`}
              onClick={(e) => onItemClick(label, e.currentTarget)}
            >
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

function DecadeChart({
  nodes,
  activeDecade,
  onDecadeClick,
}: {
  nodes: MusicNode[];
  activeDecade?: number;
  onDecadeClick: (decade: number, el: Element) => void;
}) {
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
          const isActive = activeDecade === decade;
          return (
            <g
              key={decade}
              style={{ cursor: count > 0 ? 'pointer' : 'default' }}
              onClick={(e) => count > 0 && onDecadeClick(decade, e.currentTarget)}
            >
              <rect
                x={x} y={y}
                width={barW} height={barH}
                className={
                  count === 0
                    ? 'sp-bar-decade sp-bar-decade-zero'
                    : isActive
                      ? 'sp-bar-decade sp-bar-decade-active'
                      : 'sp-bar-decade'
                }
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

function DetailPanel({
  detail,
  nodes,
  detailRef,
  onClose,
}: {
  detail: DetailState;
  nodes: MusicNode[];
  detailRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
}) {
  const songs = useMemo(() => {
    switch (detail.type) {
      case 'genre':
        return nodes.filter(n => n.genre?.trim() === detail.value);
      case 'artist':
        return nodes.filter(n => n.artist?.trim() === detail.value);
      case 'contributor':
        return nodes.filter(n => n.added_by?.trim() === detail.value);
      case 'decade':
        return nodes.filter(n => n.year && Math.floor(n.year / 10) * 10 === detail.value);
      default:
        return [];
    }
  }, [detail, nodes]);

  const title = detail.type === 'decade' ? `${detail.value}s` : String(detail.value);

  return (
    <div className="dp-panel" ref={detailRef}>
      <div
        className="dp-arrow"
        style={{ top: detail.arrowY }}
      />
      <div className="sp-head">
        <span className="sp-eyebrow">{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sp-count" style={{ marginRight: 6 }}>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="dp-body">
        {songs.length === 0
          ? <div className="dp-empty">No songs</div>
          : songs.map(n => (
              <div key={n.id} className="dp-song-row">
                <div className="dp-song-title">{n.song_title}</div>
                <div className="dp-song-meta">{n.artist}{n.year ? ` · ${n.year}` : ''}</div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

export default function StatsPanel({ nodes, onClose }: Props) {
  const panelRef  = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        (!detailRef.current || !detailRef.current.contains(target))
      ) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const genres       = useMemo(() => topN(nodes.map(n => n.genre), 5), [nodes]);
  const contributors = useMemo(() => topN(nodes.map(n => n.added_by), 5), [nodes]);
  const artists      = useMemo(() => topN(nodes.map(n => n.artist), 5), [nodes]);

  const computeArrowY = (el: Element): number => {
    if (!panelRef.current) return 50;
    const pr = panelRef.current.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return er.top + er.height / 2 - pr.top;
  };

  const handleClick = (type: DetailState['type'], value: string | number, el: Element) => {
    const arrowY = computeArrowY(el);
    setDetail(prev =>
      prev?.type === type && prev.value === value ? null : { type, value, arrowY }
    );
  };

  return (
    <>
      <div className="sp-panel" ref={panelRef}>
        <div className="sp-head">
          <span className="sp-eyebrow">Statistics</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sp-body">
          <StatList
            title="Top Genres"
            items={genres}
            activeLabel={detail?.type === 'genre' ? String(detail.value) : undefined}
            onItemClick={(label, el) => handleClick('genre', label, el)}
          />
          <StatList
            title="Top Contributors"
            items={contributors}
            activeLabel={detail?.type === 'contributor' ? String(detail.value) : undefined}
            onItemClick={(label, el) => handleClick('contributor', label, el)}
          />
          <StatList
            title="Top Artists"
            items={artists}
            activeLabel={detail?.type === 'artist' ? String(detail.value) : undefined}
            onItemClick={(label, el) => handleClick('artist', label, el)}
          />
          <DecadeChart
            nodes={nodes}
            activeDecade={detail?.type === 'decade' ? Number(detail.value) : undefined}
            onDecadeClick={(decade, el) => handleClick('decade', decade, el)}
          />
        </div>
      </div>
      {detail && (
        <DetailPanel
          detail={detail}
          nodes={nodes}
          detailRef={detailRef}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
