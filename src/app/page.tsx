'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { MusicNode, ItunesTrack, SimilarityReason } from '@/lib/types';
import { checkSimilarity } from '@/lib/similarity';
import AddSongModal from '@/components/AddSongModal';
import WelcomeScreen, { useFirstVisit } from '@/components/WelcomeScreen';

/* ------------------------------------------------------------------ */
/* Internal tree types                                                  */
/* ------------------------------------------------------------------ */

interface RawNode {
  id: string;
  parent: string | null;
  side: number;
  t: string;
  a: string;
  g: string;
  y: number | null;
  link: { kind: string; value: string } | null;
  cover: string | null;
  addedBy: string | null;
}

interface PlusNode {
  id: string;
  parent: string;
  xs: number;
  lane: number;
  subLane?: number;
  kind: 'extend-main' | 'fork-main' | 'extend-branch' | 'fork-branch';
  forkLag?: number;
  branchLag?: number;
  leafLag?: number;
}

interface BranchInfo {
  forkPoint: RawNode;
  status: 'DEAD' | 'ALIVE';
  chain: string[];
  lag: number;
}

interface Analysis {
  byId: Map<string, RawNode>;
  kidsOf: Map<string, string[]>;
  depth: Map<string, number>;
  mainPath: string[];
  mainSet: Set<string>;
  mainHead: RawNode;
  mainHeadDepth: number;
  branchInfo: Map<string, BranchInfo>;
  status: Map<string, 'MAIN' | 'DEAD' | 'ALIVE'>;
  leaves: RawNode[];
  srcId: string;
}

interface DecoratedNode extends RawNode {
  xs: number;
  lane: number;
  status: 'MAIN' | 'DEAD' | 'ALIVE';
  isMainHead: boolean;
  branchLeafId: string;
}

interface Edge {
  type: 'main' | 'alive' | 'dead' | 'plus' | 'plus-fork';
  from: { xs: number; lane: number; subLane?: number };
  to: { xs: number; lane: number; subLane?: number };
}

/* ------------------------------------------------------------------ */
/* Blockchain constants                                                  */
/* ------------------------------------------------------------------ */

const DEAD_LAG     = 3;
const FORK_PREVIEW = DEAD_LAG - 1;

/* ------------------------------------------------------------------ */
/* Convert API nodes → internal RawNode format                          */
/* ------------------------------------------------------------------ */

function toRawNodes(apiNodes: MusicNode[]): RawNode[] {
  const nodeMap = new Map(apiNodes.map(n => [n.id, n]));
  return apiNodes.map(n => {
    const parent = n.parent_id ? nodeMap.get(n.parent_id) : null;
    let link: { kind: string; value: string } | null = null;
    if (parent) {
      const sim = checkSimilarity(
        parent.song_title, parent.artist, parent.genre, parent.year,
        n.song_title, n.artist, n.genre, n.year,
      );
      if (sim.reasons.length > 0) link = { kind: sim.reasons[0].kind, value: sim.reasons[0].value };
    }
    return {
      id: n.id,
      parent: n.parent_id,
      side: 0,
      t: n.song_title,
      a: n.artist,
      g: n.genre || '',
      y: n.year,
      link,
      cover: n.album_art,
      addedBy: n.added_by,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Blockchain analysis                                                   */
/* ------------------------------------------------------------------ */

function analyze(raw: RawNode[]): Analysis {
  const byId = new Map(raw.map(n => [n.id, n]));
  const kidsOf = new Map<string, string[]>();
  raw.forEach(n => {
    if (!n.parent) return;
    if (!kidsOf.has(n.parent)) kidsOf.set(n.parent, []);
    kidsOf.get(n.parent)!.push(n.id);
  });

  const depth = new Map<string, number>();
  const computeDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const n = byId.get(id)!;
    const d = n.parent ? computeDepth(n.parent) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  raw.forEach(n => computeDepth(n.id));

  const srcId = raw.find(n => !n.parent)!.id;
  const longestFrom = (id: string): string[] => {
    const ks = kidsOf.get(id) || [];
    if (!ks.length) return [id];
    let best: string[] = [];
    for (const k of ks) {
      const p = longestFrom(k);
      if (p.length > best.length) best = p;
    }
    return [id, ...best];
  };
  const mainPath = longestFrom(srcId);
  const mainSet = new Set(mainPath);
  const mainHead = byId.get(mainPath[mainPath.length - 1])!;
  const mainHeadDepth = depth.get(mainHead.id)!;

  const leaves = raw.filter(n => !kidsOf.has(n.id));
  const branchInfo = new Map<string, BranchInfo>();
  leaves.forEach(leaf => {
    if (mainSet.has(leaf.id)) return;
    const chain: string[] = [];
    let cur: RawNode | undefined = leaf;
    while (cur && !mainSet.has(cur.id)) {
      chain.push(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    const forkPoint = cur!;
    const lag = mainHeadDepth - depth.get(forkPoint.id)!;
    const status: 'DEAD' | 'ALIVE' = lag >= DEAD_LAG ? 'DEAD' : 'ALIVE';
    chain.reverse();
    branchInfo.set(leaf.id, { forkPoint, status, chain, lag });
  });

  const status = new Map<string, 'MAIN' | 'DEAD' | 'ALIVE'>();
  raw.forEach(n => {
    if (mainSet.has(n.id)) { status.set(n.id, 'MAIN'); return; }
    let cur = n;
    while ((kidsOf.get(cur.id) || []).length) cur = byId.get(kidsOf.get(cur.id)![0])!;
    const info = branchInfo.get(cur.id);
    status.set(n.id, info ? info.status : 'ALIVE');
  });

  return { byId, kidsOf, depth, mainPath, mainSet, mainHead, mainHeadDepth, branchInfo, status, leaves, srcId };
}

/* ------------------------------------------------------------------ */
/* Lane assignment (side computed from insertion order)                  */
/* ------------------------------------------------------------------ */

function assignLanes(raw: RawNode[], ana: Analysis): Map<string, number> {
  const { mainSet, kidsOf, depth, mainHeadDepth } = ana;
  const laneOf = new Map<string, number>();
  raw.forEach(n => { if (mainSet.has(n.id)) laneOf.set(n.id, 0); });

  // Primary branches: direct non-main children of main nodes.
  // These are the true fork points. Within-branch forks (non-main nodes with
  // multiple children) are handled recursively inside assignSubtree.
  const primaryRoots = raw.filter(n => !mainSet.has(n.id) && !!n.parent && mainSet.has(n.parent));

  // Assign alternating sides per fork point, in raw (insertion) order.
  const forkSideCounter = new Map<string, number>();
  const rootSide = new Map<string, number>();
  primaryRoots.forEach(n => {
    const count = forkSideCounter.get(n.parent!) ?? 0;
    forkSideCounter.set(n.parent!, count + 1);
    rootSide.set(n.id, count % 2 === 0 ? 1 : -1);
  });

  // Deepest leaf depth in a sub-tree (for occupancy range).
  const maxLeafDepth = (id: string): number => {
    const kids = kidsOf.get(id);
    if (!kids || !kids.length) return depth.get(id)!;
    return Math.max(...kids.map(maxLeafDepth));
  };

  // Sort for occupancy: side=-1 first, then most-recently-forked first within side.
  const sortedRoots = [...primaryRoots].sort((a, b) => {
    const sa = rootSide.get(a.id)!, sb = rootSide.get(b.id)!;
    if (sa !== sb) return sa - sb;
    return depth.get(b.id)! - depth.get(a.id)!;
  });

  const occupancy: Record<string, [number, number][][]> = { '-1': [], '1': [] };
  const rootSlot = new Map<string, number>();

  sortedRoots.forEach(n => {
    const side = rootSide.get(n.id)!;
    const key = side < 0 ? '-1' : '1';
    const forkLag = mainHeadDepth - (depth.get(n.id)! - 1);
    const isAlive = forkLag < DEAD_LAG;
    const mld = maxLeafDepth(n.id);
    const xRange: [number, number] = [depth.get(n.id)!, isAlive ? mld + 1 : mld];

    let slot = 1;
    while (true) {
      const taken = occupancy[key][slot - 1] || [];
      const overlap = taken.some(([x0, x1]) => !(xRange[1] + 0.4 < x0 || xRange[0] - 0.4 > x1));
      if (!overlap) {
        if (!occupancy[key][slot - 1]) occupancy[key][slot - 1] = [];
        occupancy[key][slot - 1].push(xRange);
        break;
      }
      slot++;
    }
    rootSlot.set(n.id, slot);
  });

  // Assign lanes to a primary branch's entire sub-tree.
  // First child of any within-branch fork inherits the parent lane;
  // subsequent children step one slot further from main on the same side.
  const assignSubtree = (nodeId: string, lane: number, side: number, nextSlot: number) => {
    laneOf.set(nodeId, lane);
    const kids = (kidsOf.get(nodeId) ?? []).filter(k => !mainSet.has(k));
    kids.forEach((kid, i) => {
      const childLane = i === 0 ? lane : side * nextSlot;
      const childNext  = i === 0 ? nextSlot : nextSlot + 1;
      assignSubtree(kid, childLane, side, childNext);
    });
  };

  primaryRoots.forEach(n => {
    const side = rootSide.get(n.id)!;
    const slot = rootSlot.get(n.id)!;
    assignSubtree(n.id, side * slot, side, slot + 1);
  });

  return laneOf;
}

/* ------------------------------------------------------------------ */
/* Plus generation                                                       */
/* ------------------------------------------------------------------ */

function generatePluses(raw: RawNode[], ana: Analysis, laneOf: Map<string, number>): PlusNode[] {
  const { mainPath, mainHead, mainHeadDepth, depth, branchInfo, kidsOf, mainSet } = ana;
  const pluses: PlusNode[] = [];

  if ((kidsOf.get(mainHead.id) ?? []).length < 3) {
    pluses.push({
      id: '+main_head',
      parent: mainHead.id,
      xs: mainHeadDepth + 1,
      lane: 0,
      kind: 'extend-main',
    });
  }

  for (let lag = 1; lag <= FORK_PREVIEW; lag++) {
    const idx = mainPath.length - 1 - lag;
    if (idx < 0) break;
    const mid = mainPath[idx];
    if ((kidsOf.get(mid) ?? []).length >= 3) continue;
    const midDepth = depth.get(mid)!;
    // Check all non-main nodes at this depth to detect branches passing through the same column.
    const lanesAtDepth = raw
      .filter(n => !mainSet.has(n.id) && depth.get(n.id) === midDepth)
      .map(n => laneOf.get(n.id) ?? 0);
    const hasUp = lanesAtDepth.some(l => l < 0);
    const hasDn = lanesAtDepth.some(l => l > 0);
    const side = hasUp && !hasDn ? 1 : !hasUp && hasDn ? -1 : lag % 2 === 0 ? 1 : -1;
    pluses.push({
      id: `+fork_${mid}`,
      parent: mid,
      xs: midDepth,
      lane: 0,
      subLane: side * 0.35,
      kind: 'fork-main',
      forkLag: lag,
    });
  }

  const usedForkBranchIds = new Set<string>();
  branchInfo.forEach((info, leafId) => {
    if (info.status === 'DEAD') return;
    const leafDepth = depth.get(leafId)!;
    pluses.push({
      id: `+extend_${leafId}`,
      parent: leafId,
      xs: leafDepth + 1,
      lane: laneOf.get(leafId) ?? 0,
      kind: 'extend-branch',
      branchLag: info.lag,
      leafLag: mainHeadDepth - leafDepth,
    });

    // Fork pluses for 1 and 2 nodes behind the branch leaf
    for (let lag = 1; lag <= FORK_PREVIEW; lag++) {
      const chainIdx = info.chain.length - 1 - lag;
      if (chainIdx < 0) break;
      const nodeId = info.chain[chainIdx];
      if ((kidsOf.get(nodeId) ?? []).length >= 3) continue;
      if (usedForkBranchIds.has(nodeId)) continue;
      usedForkBranchIds.add(nodeId);
      const nodeLane = laneOf.get(nodeId) ?? 0;
      const nodeDepth = depth.get(nodeId)!;
      pluses.push({
        id: `+fork_branch_${nodeId}`,
        parent: nodeId,
        xs: nodeDepth,
        lane: nodeLane,
        subLane: (nodeLane >= 0 ? 1 : -1) * 0.35,
        kind: 'fork-branch',
        forkLag: mainHeadDepth - nodeDepth,
      });
    }
  });

  return pluses;
}

/* ------------------------------------------------------------------ */
/* Cover art placeholder                                                 */
/* ------------------------------------------------------------------ */

const COVER_PALETTES = [
  ['#0d0d0d', '#fafaf7'],
  ['#e3dcc7', '#0d0d0d'],
  ['#cfd6cf', '#0d0d0d'],
  ['#e7c69a', '#0d0d0d'],
  ['#bbb6a4', '#fafaf7'],
  ['#0d0d0d', '#d7c8a8'],
  ['#c2b8a3', '#0d0d0d'],
  ['#a8a89b', '#fafaf7'],
];

function CoverSvg({ seed }: { seed: number }) {
  const [bg, fg] = COVER_PALETTES[Math.abs(seed) % COVER_PALETTES.length];
  const m = Math.abs(seed) % 6;
  return (
    <svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"
         preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect width="56" height="56" fill={bg} />
      {m === 0 && <circle cx="28" cy="28" r="14" fill={fg} />}
      {m === 1 && <rect x="0" y="22" width="56" height="12" fill={fg} />}
      {m === 2 && <rect x="8" y="8" width="40" height="40" fill="none" stroke={fg} strokeWidth="2" />}
      {m === 3 && <path d="M0 56 L56 0 L56 56 Z" fill={fg} />}
      {m === 4 && <>
        <circle cx="20" cy="28" r="10" fill="none" stroke={fg} strokeWidth="2" />
        <circle cx="36" cy="28" r="10" fill="none" stroke={fg} strokeWidth="2" />
      </>}
      {m === 5 && <>
        <rect x="6"  y="6"  width="8" height="44" fill={fg} />
        <rect x="22" y="6"  width="8" height="44" fill={fg} opacity="0.6" />
        <rect x="38" y="6"  width="8" height="44" fill={fg} opacity="0.3" />
      </>}
    </svg>
  );
}

function PlusSign() {
  return (
    <svg className="plus-sign" viewBox="0 0 20 20" fill="none">
      <line x1="10" y1="4"  x2="10" y2="16" />
      <line x1="4"  y1="10" x2="16" y2="10" />
    </svg>
  );
}

function ForkArrow({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg className="fork-arrow" viewBox="0 0 20 14" fill="none">
      {dir === 'down'
        ? <path d="M4 3 L10 11 L16 3" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M4 11 L10 3 L16 11" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function linkSentence(link: { kind: string; value: string } | null) {
  if (!link) return null;
  if (link.kind === 'word')   return <>shares the word <em>&ldquo;{link.value}&rdquo;</em> with the parent</>;
  if (link.kind === 'artist') return <>same artist — <em>{link.value}</em></>;
  if (link.kind === 'year')   return <>released the same year — <em>{link.value}</em></>;
  if (link.kind === 'genre')  return <>same genre — <em>{link.value}</em></>;
  return null;
}

function smoothPath(x1: number, y1: number, x2: number, y2: number) {
  if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const dx = x2 - x1;
  return `M ${x1} ${y1} C ${x1 + dx * 0.55} ${y1}, ${x2 - dx * 0.45} ${y2}, ${x2} ${y2}`;
}

/* ------------------------------------------------------------------ */
/* Layout constants                                                      */
/* ------------------------------------------------------------------ */

const NODE          = 56;
const STEP          = 158;
const LANE          = 134;
const SOURCE_OFFSET = 180;

/* ------------------------------------------------------------------ */
/* Main App                                                              */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const [apiNodes, setApiNodes]   = useState<MusicNode[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addingPlus, setAddingPlus] = useState<PlusNode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError]   = useState<string | null>(null);
  const { show: showWelcome, dismiss: dismissWelcome } = useFirstVisit();

  /* Fetch nodes on mount */
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      const data = await res.json();
      if (res.ok) setApiNodes(data.nodes || []);
      else setFetchError(data.error);
    } catch {
      setFetchError('Failed to load the music tree.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  /* Supabase realtime */
  useEffect(() => {
    async function subscribe() {
      try {
        const { supabase } = await import('@/lib/supabase');
        const channel = supabase
          .channel('music_nodes_changes')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'music_nodes' }, payload => {
            setApiNodes(prev => {
              if (prev.find(n => n.id === (payload.new as MusicNode).id)) return prev;
              return [...prev, payload.new as MusicNode];
            });
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      } catch { /* supabase not configured */ }
    }
    subscribe();
  }, []);

  /* Convert API nodes to internal raw format */
  const rawNodes = useMemo(() => toRawNodes(apiNodes), [apiNodes]);

  /* Blockchain analysis */
  const ana     = useMemo(() => rawNodes.length > 0 ? analyze(rawNodes) : null, [rawNodes]);
  const laneOf  = useMemo(() => ana ? assignLanes(rawNodes, ana) : new Map<string, number>(), [ana, rawNodes]);
  const pluses  = useMemo(() => ana ? generatePluses(rawNodes, ana, laneOf) : [], [ana, laneOf, rawNodes]);

  const ancestorSongs = useMemo((): { t: string; a: string }[] => {
    if (!ana || !addingPlus?.parent) return [];
    const songs: { t: string; a: string }[] = [];
    let cur = ana.byId.get(addingPlus.parent);
    let steps = 0;
    while (cur && steps < 50) {
      songs.push({ t: cur.t, a: cur.a });
      cur = cur.parent ? ana.byId.get(cur.parent) : undefined;
      steps++;
    }
    // Exclude all existing children — no two siblings can be the same song.
    for (const kidId of ana.kidsOf.get(addingPlus.parent) ?? []) {
      const kid = ana.byId.get(kidId);
      if (kid) songs.push({ t: kid.t, a: kid.a });
    }
    return songs;
  }, [ana, addingPlus]);

  const decorated = useMemo((): DecoratedNode[] => {
    if (!ana) return [];
    return rawNodes.map(n => ({
      ...n,
      xs: ana.depth.get(n.id) ?? 0,
      lane: laneOf.get(n.id) ?? 0,
      status: ana.status.get(n.id) ?? 'MAIN',
      isMainHead: n.id === ana.mainHead.id,
      branchLeafId: (() => {
        let cur = n;
        while ((ana.kidsOf.get(cur.id) || []).length) cur = ana.byId.get(ana.kidsOf.get(cur.id)![0])!;
        return cur.id;
      })(),
    }));
  }, [ana, laneOf, rawNodes]);

  const byIdDeco = useMemo(() => new Map(decorated.map(n => [n.id, n])), [decorated]);

  /* Nodes that have a downward fork indicator — their label must move above */
  const nodesWithDownFork = useMemo(() => {
    const set = new Set<string>();
    pluses.forEach(p => {
      if ((p.kind === 'fork-main' || p.kind === 'fork-branch') && (p.subLane ?? 0) > 0) {
        set.add(p.parent);
      }
    });
    return set;
  }, [pluses]);

  /* Layout dimensions */
  const allLanes = [...decorated.map(n => n.lane), ...pluses.map(p => (p.lane ?? 0) + (p.subLane ?? 0))];
  const minLane  = allLanes.length > 0 ? Math.min(...allLanes) : 0;
  const maxLane  = allLanes.length > 0 ? Math.max(...allLanes) : 0;
  const maxX     = decorated.length > 0
    ? Math.max(...decorated.map(n => n.xs), ...pluses.map(p => p.xs))
    : 1;
  const SVG_W    = SOURCE_OFFSET + maxX * STEP + 220;
  const VERT_PAD = 110;
  const SVG_H    = (maxLane - minLane) * LANE + 2 * VERT_PAD;
  const Y_FOR_LANE_0 = -minLane * LANE + VERT_PAD;

  const xOf = (n: { xs: number }) => SOURCE_OFFSET + n.xs * STEP;
  const yOf = (n: { lane: number; subLane?: number }) => Y_FOR_LANE_0 + (n.lane + (n.subLane ?? 0)) * LANE;

  /* Pan / drag */
  const [viewportW, setViewportW] = useState(typeof window !== 'undefined' ? window.innerWidth  : 1280);
  const [viewportH, setViewportH] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const spineRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef    = useRef({ x: 0, y: 0 });
  const [, force] = useState(0);
  const zoomRef   = useRef(1);
  const [zoom, setZoom] = useState(1);

  const clampX = useCallback((x: number) => {
    const z = zoomRef.current;
    return Math.min(viewportW * 0.82 - SOURCE_OFFSET * z, Math.max(viewportW * 0.18 - SVG_W * z, x));
  }, [viewportW, SVG_W]);
  const clampY = useCallback((y: number) => {
    const z = zoomRef.current;
    return Math.min(viewportH * 0.70, Math.max(viewportH * 0.30 - SVG_H * z, y));
  }, [viewportH, SVG_H]);

  const applyPan = useCallback((x: number, y: number) => {
    const cx = clampX(x), cy = clampY(y);
    panRef.current.x = cx;
    panRef.current.y = cy;
    if (spineRef.current) {
      spineRef.current.style.transformOrigin = '0 0';
      spineRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${zoomRef.current})`;
    }
    force(t => t + 1);
  }, [clampX, clampY]);

  const applyZoom = useCallback((newZ: number, pivotX: number, pivotY: number) => {
    const clamped = Math.min(2, Math.max(0.1, newZ));
    const ratio = clamped / zoomRef.current;
    zoomRef.current = clamped;
    panRef.current.x = pivotX - (pivotX - panRef.current.x) * ratio;
    panRef.current.y = pivotY - (pivotY - panRef.current.y) * ratio;
    if (spineRef.current) {
      spineRef.current.style.transformOrigin = '0 0';
      spineRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${clamped})`;
    }
    setZoom(clamped);
    force(t => t + 1);
  }, []);

  const animRef = useRef<number | null>(null);
  const cancelAnim = () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; } };
  const animateTo = useCallback((targetX: number, targetY: number) => {
    cancelAnim();
    const sx = panRef.current.x, ex = clampX(targetX);
    const sy = panRef.current.y, ey = clampY(targetY);
    const dur = 460, t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      applyPan(sx + (ex - sx) * e, sy + (ey - sy) * e);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(tick);
  }, [clampX, clampY, applyPan]);

  const centreOn = useCallback((node: { xs: number; lane: number; subLane?: number }) =>
    animateTo(viewportW / 2 - xOf(node) * zoomRef.current, viewportH / 2 - yOf(node) * zoomRef.current),
  [animateTo, viewportW, viewportH, xOf, yOf]); // eslint-disable-line

  const drag = useRef({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0, lastX: 0, lastY: 0, lastT: 0, velX: 0, velY: 0 });
  const inertia = useRef<number | null>(null);
  const cancelInertia = () => { if (inertia.current) { cancelAnimationFrame(inertia.current); inertia.current = null; } };
  const [hasMoved, setHasMoved] = useState(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchState = useRef({ dist: 0, midX: 0, midY: 0 });

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const pts = activePointers.current;

    const getPinch = () => {
      const iter = pts.values();
      const a = iter.next().value as { x: number; y: number };
      const b = iter.next().value as { x: number; y: number };
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('.node')) return;
      cancelAnim(); cancelInertia();
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        drag.current.active = false;
        const p = getPinch();
        pinchState.current = { dist: p.dist, midX: p.midX, midY: p.midY };
      } else {
        drag.current = { active: true, startX: e.clientX, startY: e.clientY, startPanX: panRef.current.x, startPanY: panRef.current.y, lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), velX: 0, velY: 0 };
      }
      el.classList.add('dragging');
    };

    const onMove = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const p = getPinch();
        const prev = pinchState.current;
        if (prev.dist > 0) {
          const rect = el.getBoundingClientRect();
          applyZoom(zoomRef.current * (p.dist / prev.dist), p.midX - rect.left, p.midY - rect.top);
          applyPan(panRef.current.x + (p.midX - prev.midX), panRef.current.y + (p.midY - prev.midY));
        }
        pinchState.current = { dist: p.dist, midX: p.midX, midY: p.midY };
        if (!hasMoved) setHasMoved(true);
        return;
      }
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.startX, dy = e.clientY - drag.current.startY;
      applyPan(drag.current.startPanX + dx, drag.current.startPanY + dy);
      const now = performance.now(), dt = Math.max(8, now - drag.current.lastT);
      drag.current.velX = (e.clientX - drag.current.lastX) / dt;
      drag.current.velY = (e.clientY - drag.current.lastY) / dt;
      drag.current.lastX = e.clientX; drag.current.lastY = e.clientY; drag.current.lastT = now;
      if (!hasMoved && Math.hypot(dx, dy) > 12) setHasMoved(true);
    };

    const endDrag = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size === 1) {
        const pt = pts.values().next().value as { x: number; y: number };
        pinchState.current.dist = 0;
        drag.current = { active: true, startX: pt.x, startY: pt.y, startPanX: panRef.current.x, startPanY: panRef.current.y, lastX: pt.x, lastY: pt.y, lastT: performance.now(), velX: 0, velY: 0 };
        return;
      }
      if (!drag.current.active) { el.classList.remove('dragging'); return; }
      drag.current.active = false;
      el.classList.remove('dragging');
      let vx = drag.current.velX * 16, vy = drag.current.velY * 16;
      const tick = () => {
        vx *= 0.93; vy *= 0.93;
        if (Math.hypot(vx, vy) < 0.3) { inertia.current = null; return; }
        applyPan(panRef.current.x + vx, panRef.current.y + vy);
        inertia.current = requestAnimationFrame(tick);
      };
      inertia.current = requestAnimationFrame(tick);
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [hasMoved, applyPan, applyZoom]);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 && e.deltaY === 0) return;
      e.preventDefault();
      cancelAnim(); cancelInertia();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        applyZoom(zoomRef.current * (1 - e.deltaY * 0.003), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0       : e.deltaY;
        applyPan(panRef.current.x - dx, panRef.current.y - dy * 0.6);
      }
      if (!hasMoved) setHasMoved(true);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasMoved, applyPan, applyZoom]);

  useEffect(() => {
    const onR = () => { setViewportW(window.innerWidth); setViewportH(window.innerHeight); };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  const initialFitDone = useRef(false);
  useLayoutEffect(() => {
    if (decorated.length === 0 || initialFitDone.current) return;
    initialFitDone.current = true;
    const pad = 80;
    const newZ = Math.min(2, Math.max(0.1, Math.min((viewportW - pad * 2) / SVG_W, (viewportH - pad * 2) / SVG_H)));
    zoomRef.current = newZ;
    setZoom(newZ);
    const panX = (viewportW - SVG_W * newZ) / 2;
    const panY = (viewportH - SVG_H * newZ) / 2;
    panRef.current.x = panX;
    panRef.current.y = panY;
    if (spineRef.current) {
      spineRef.current.style.transformOrigin = '0 0';
      spineRef.current.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${newZ})`;
    }
  }, [decorated, SVG_W, SVG_H, viewportW, viewportH]); // eslint-disable-line

  /* Selection / hover */
const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId,  setHoverId]  = useState<string | null>(null);


  /* Keyboard nav on main path */
  useEffect(() => {
    if (!ana) return;
    const onKey = (e: KeyboardEvent) => {
      const mp = ana.mainPath;
      const i  = activeId ? mp.indexOf(activeId) : -1;
      if (e.key === 'ArrowRight' && i >= 0 && i < mp.length - 1) {
        const next = byIdDeco.get(mp[i + 1])!;
        setActiveId(next.id); centreOn(next); setHasMoved(true);
      } else if (e.key === 'ArrowLeft' && i > 0) {
        const prev = byIdDeco.get(mp[i - 1])!;
        setActiveId(prev.id); centreOn(prev); setHasMoved(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, ana, byIdDeco, centreOn]);

  /* Add song handler */
  async function handleAdd({ track, addedBy }: { track: ItunesTrack & { year: number | null }; reasons: SimilarityReason[]; link: SimilarityReason; addedBy: string }) {
    if (!addingPlus || !ana) return;
    const plus = addingPlus;

    let side = 0;
    if (plus.kind === 'extend-main') side = 0;
    else if (plus.kind === 'fork-main') side = (plus.subLane ?? 0) >= 0 ? 1 : -1;
    else side = (laneOf.get(plus.parent) ?? 0) >= 0 ? 1 : -1;

    setSubmitting(true);
    setAddError(null);
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: plus.parent,
          song_title: track.trackName,
          artist: track.artistName,
          genre: track.primaryGenreName || null,
          year: track.year,
          album_art: track.artworkUrl100 || null,
          itunes_url: track.trackViewUrl || null,
          preview_url: track.previewUrl || null,
          added_by: addedBy,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Failed to add song.'); return; }

      const newNode: MusicNode = data.node;
      setApiNodes(prev => prev.find(n => n.id === newNode.id) ? prev : [...prev, newNode]);
      setAddingPlus(null);
      setActiveId(newNode.id);

      setTimeout(() => {
        const depth = newNode.depth;
        const z = zoomRef.current;
        animateTo(viewportW / 2 - (SOURCE_OFFSET + depth * STEP) * z, viewportH / 2 - (Y_FOR_LANE_0 + side * LANE) * z);
      }, 80);
    } finally {
      setSubmitting(false);
    }
  }

  /* Edges */
  const edges = useMemo((): Edge[] => {
    const out: Edge[] = [];
    decorated.forEach(n => {
      if (!n.parent) return;
      const p = byIdDeco.get(n.parent)!;
      const type = (n.status === 'DEAD' || p.status === 'DEAD') ? 'dead'
                 : (n.status === 'MAIN' && p.status === 'MAIN') ? 'main' : 'alive';
      out.push({ type, from: p, to: n });
    });
    pluses.forEach(pl => {
      const p = byIdDeco.get(pl.parent)!;
      if (!p) return;
      out.push({ type: pl.kind === 'fork-main' ? 'plus-fork' : 'plus', from: p, to: pl });
    });
    return out;
  }, [pluses, decorated, byIdDeco]);

  /* Hover card focus */
  const allNodes = [...decorated, ...pluses];
  const focusId     = hoverId ?? activeId;
  const readoutId   = hoverId ?? activeId;
  const focusNode   = allNodes.find(n => n.id === focusId);
  const readoutNode = allNodes.find(n => n.id === readoutId);
  const focusIsPlus = !!(focusNode as PlusNode | undefined)?.kind;
  const focusScreenX = focusNode ? xOf(focusNode) * zoomRef.current + panRef.current.x : 0;
  const focusScreenY = focusNode ? yOf(focusNode as { lane: number; subLane?: number }) * zoomRef.current + panRef.current.y : 0;
  const focusLaneEff = ((focusNode as { lane?: number } | undefined)?.lane ?? 0) + ((focusNode as PlusNode | undefined)?.subLane ?? 0);
  const cardBelow    = focusLaneEff < 0;
  const focusIsPlus2 = focusIsPlus;
  const focusPKind   = (focusNode as PlusNode | undefined)?.kind;
  const focusH       = focusIsPlus2
    ? (focusPKind === 'fork-main' || focusPKind === 'fork-branch' ? 28 : focusPKind === 'extend-main' ? 46 : 36)
    : NODE;
  const cardTop      = cardBelow
    ? focusScreenY + focusH / 2 + 12
    : focusScreenY - focusH / 2 - 12;
  const focusParent  = (focusNode as DecoratedNode | undefined)?.parent
    ? byIdDeco.get((focusNode as DecoratedNode).parent!)
    : null;

  /* Mini-tree */
  const MiniTree = () => {
    const W = 240, H = 56;
    const ySpan = Math.max(1, maxLane - minLane);
    const sx = (n: { xs: number }) => 12 + (n.xs / Math.max(maxX, 1)) * (W - 24);
    const sy = (n: { lane: number; subLane?: number }) =>
      H / 2 + (((n.lane + (n.subLane ?? 0)) - (minLane + maxLane) / 2) / ySpan) * (H - 16);
    return (
      <svg width={W} height={H}>
        {edges.map((e, i) => {
          const x1 = sx(e.from), y1 = sy(e.from), x2 = sx(e.to), y2 = sy(e.to);
          const path = Math.abs(y1 - y2) < 0.5
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          let color = '#0d0d0d', dash = '0', w = 0.8, alpha = 0.7;
          if (e.type === 'main')  { w = 1.4; alpha = 0.95; }
          if (e.type === 'dead')  { color = '#b5b5ad'; dash = '2 2'; alpha = 0.9; }
          if (e.type === 'plus' || e.type === 'plus-fork') { dash = '1.5 1.5'; alpha = 0.5; }
          return <path key={i} d={path} stroke={color} strokeWidth={w} strokeDasharray={dash} fill="none" opacity={alpha} />;
        })}
        {decorated.map(n => {
          const cx = sx(n), cy = sy(n);
          const isFocus = n.id === readoutId;
          const color = isFocus ? 'var(--accent)' : n.status === 'DEAD' ? '#b5b5ad' : '#0d0d0d';
          if (n.id === ana?.srcId)
            return <rect key={n.id} x={cx - 3} y={cy - 3} width="6" height="6" fill={color} />;
          return <circle key={n.id} cx={cx} cy={cy} r={n.status === 'MAIN' ? 3 : 2.5} fill={color} />;
        })}
        {pluses.map(p => {
          const cx = sx(p), cy = sy(p);
          return <circle key={p.id} cx={cx} cy={cy} r="2.4" fill="none"
                         stroke={p.id === readoutId ? 'var(--accent)' : '#0d0d0d'}
                         strokeDasharray="1.2 1.2" strokeWidth="0.9" />;
        })}
      </svg>
    );
  };

  const showHint   = !hasMoved;
  const mainCount  = ana?.mainPath.length ?? 0;
  const deadCount  = decorated.filter(n => n.status === 'DEAD').length;
  const aliveCount = decorated.filter(n => n.status === 'ALIVE').length;

  const branchTag = (n: DecoratedNode) => {
    if (n.status === 'MAIN') return { label: 'Main', cls: 'main' };
    if (n.status === 'DEAD') return { label: 'Dead', cls: 'dead' };
    return { label: 'Alive', cls: '' };
  };

  const pl = (n: number, s = 'block') => `${n} ${n === 1 ? s : s + 's'}`;

  /* --------------------------------------------------------- */
  /* Loading / error / empty states                             */
  /* --------------------------------------------------------- */

  if (loading) {
    return (
      <div className="app">
        <div className="loading-state">
          <p>Loading the music tree…</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="app">
        <div className="loading-state">
          <p style={{ color: 'var(--dead)' }}>{fetchError}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Check your Supabase environment variables in .env.local
          </p>
        </div>
      </div>
    );
  }

  if (apiNodes.length === 0) {
    return (
      <div className="app">
        <div className="empty-state">
          <div className="brand" style={{ marginBottom: 8 }}>
            <span className="mark"></span>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 500, margin: 0, letterSpacing: '0.02em' }}>Music Blockchain</h1>
            </div>
          </div>
          <h2>The chain is empty</h2>
          <p>Be the first to plant a seed. Pick any song to start the music blockchain.</p>
          <button className="btn-seed" onClick={() => {
            const seedPlus: PlusNode = { id: '+seed', parent: '', xs: 0, lane: 0, kind: 'extend-main' };
            const seedParent: RawNode = { id: '', parent: null, side: 0, t: '', a: '', g: '', y: null, link: null, cover: null, addedBy: null };
            setAddingPlus(seedPlus);
          }}>
            Plant the Seed
          </button>
        </div>
        {addingPlus && (
          <SeedModal
            onClose={() => setAddingPlus(null)}
            onAdd={async (track, addedBy) => {
              setSubmitting(true);
              try {
                const res = await fetch('/api/nodes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    parent_id: null,
                    song_title: track.trackName,
                    artist: track.artistName,
                    genre: track.primaryGenreName || null,
                    year: track.year,
                    album_art: track.artworkUrl100 || null,
                    itunes_url: track.trackViewUrl || null,
                    preview_url: track.previewUrl || null,
                    added_by: addedBy,
                  }),
                });
                const data = await res.json();
                if (res.ok) {
                  setApiNodes([data.node]);
                  setAddingPlus(null);
                }
              } finally {
                setSubmitting(false);
              }
            }}
          />
        )}
      </div>
    );
  }

  /* --------------------------------------------------------- */
  /* Main tree render                                           */
  /* --------------------------------------------------------- */

  return (
    <div className="app">
      {/* Top chrome */}
      <div className="chrome-top">
        <div className="brand">
          <span className="mark"></span>
          <div>
            <h1>Music Blockchain</h1>
            <div className="sub">Longest chain wins. Branches die after {DEAD_LAG} blocks.</div>
          </div>
        </div>
        <div className="meta-strip">
          <span className="main-c"><b>{mainCount}</b>&nbsp; main</span>
          <span><b>{aliveCount}</b>&nbsp; alive</span>
          <span className="dead-c"><b>{deadCount}</b>&nbsp; dead</span>
          <span><b>{decorated.length}</b>&nbsp; total</span>
        </div>
      </div>

      <div className={'hint ' + (showHint ? '' : 'faded')}>
        <span>drag in any direction</span>
        <span className="dot"></span>
        <span>hover for details</span>
        <span className="dot"></span>
        <span>click <span className="kbd">+</span> at any tip to extend</span>
      </div>

      <div className="canvas" ref={canvasRef} onClick={() => setActiveId(null)}>
        <div className="spine" ref={spineRef}
             style={{ width: SVG_W, height: SVG_H, transformOrigin: '0 0', transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})` }}>

          {ana && (
            <div className="main-rail-label"
                 style={{ left: SOURCE_OFFSET + ana.mainHeadDepth * STEP - 80, top: Y_FOR_LANE_0 - 56 }}>
              Main branch · longest chain
            </div>
          )}

          <svg className="tree-svg" width={SVG_W} height={SVG_H}>
            {edges.map((e, i) => {
              const cls = e.type === 'main'      ? 'edge-main'
                        : e.type === 'dead'      ? 'edge-dead'
                        : e.type === 'plus'      ? 'edge-plus'
                        : e.type === 'plus-fork' ? 'edge-plus-fork'
                        : 'edge-alive';
              return <path key={i} className={cls}
                           d={smoothPath(xOf(e.from), yOf(e.from as { lane: number; subLane?: number }), xOf(e.to), yOf(e.to as { lane: number; subLane?: number }))} />;
            })}
          </svg>

          {decorated.map(n => {
            const isSource = n.id === ana?.srcId;
            const cls = ['node',
              isSource ? 'source' : '',
              n.status === 'MAIN' ? 'main' : '',
              n.status === 'DEAD' ? 'dead' : '',
              n.isMainHead ? 'head' : '',
              n.id === activeId ? 'active' : '',
              n.id === hoverId  ? 'hovered' : '',
              nodesWithDownFork.has(n.id) ? 'label-top' : '',
            ].filter(Boolean).join(' ');
            const seed = n.xs * 5 + (n.lane + 3) * 7 + (isSource ? 1 : 0);
            const showDeadTag = n.status === 'DEAD' && n.id === n.branchLeafId;
            return (
              <div key={n.id} className={cls}
                   style={{ left: xOf(n), top: yOf(n) }}
                   onMouseEnter={() => setHoverId(n.id)}
                   onMouseLeave={() => setHoverId(null)}
                   onClick={e => { e.stopPropagation(); setActiveId(n.id); centreOn(n); }}>
                <div className="node-shape">
                  <div className="cover-frame">
                    {n.cover
                      ? <img src={n.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <CoverSvg seed={seed} />}
                  </div>
                </div>
                {showDeadTag && <div className="death-tag">DEAD</div>}
                <div className="index-label">
                  <span className="ord">
                    {isSource
                      ? '00 · SOURCE'
                      : n.isMainHead
                      ? n.id.slice(0, 6).toUpperCase() + ' · HEAD'
                      : n.id.slice(0, 6).toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}

          {pluses.map(p => {
            const isFork = p.kind === 'fork-main' || p.kind === 'fork-branch';
            const forkDir: 'up' | 'down' = (p.subLane ?? 0) >= 0 ? 'down' : 'up';
            const cls = ['node', 'plus', 'kind-' + p.kind,
              p.id === hoverId ? 'hovered' : ''].filter(Boolean).join(' ');
            const label = p.kind === 'extend-main'                    ? 'EXTEND MAIN'
                        : isFork ? 'FORK'
                        : 'EXTEND';
            return (
              <div key={p.id} className={cls}
                   style={{ left: xOf(p), top: yOf(p) }}
                   onMouseEnter={() => setHoverId(p.id)}
                   onMouseLeave={() => setHoverId(null)}
                   onClick={e => {
                     e.stopPropagation();
                     setActiveId(p.id);
                     setHoverId(null);
                     setAddError(null);
                     setAddingPlus(p);
                   }}>
                <div className="node-shape">{isFork ? <ForkArrow dir={forkDir} /> : <PlusSign />}</div>
                <div className="index-label"><span className="ord">{label}</span></div>
              </div>
            );
          })}
        </div>

        <div className="edge-mask left"></div>
        <div className="edge-mask right"></div>

        {/* Hovercard: song node */}
        {focusNode && !focusIsPlus && (() => {
          const dn = focusNode as DecoratedNode;
          const tag = branchTag(dn);
          const klass = 'hovercard show ' + (dn.status === 'DEAD' ? 'dead-card ' : '') + (cardBelow ? 'below' : '');
          return (
            <div className={klass} style={{ left: focusScreenX, top: cardTop }}>
              <div className="eyebrow">
                <span className={'branch-tag ' + tag.cls}>{tag.label} branch</span>
                <span className="mono">{dn.y}</span>
              </div>
              <div className="title">{dn.t}</div>
              <div className="artist">{dn.a}</div>
              <div className="meta">
                <span><b>Genre</b>&nbsp; {dn.g || '—'}</span>
                <span><b>Block</b>&nbsp; {dn.id.slice(0, 8).toUpperCase()}</span>
                <span><b>Depth</b>&nbsp; {dn.xs}</span>
                {dn.addedBy && <span><b>Added by</b>&nbsp; {dn.addedBy}</span>}
              </div>

              {focusParent && dn.link && dn.status !== 'DEAD' && (
                <div className="link-reason">
                  <span className="lbl">Link to {focusParent.id.slice(0, 6).toUpperCase()}</span>
                  {linkSentence(dn.link)}
                </div>
              )}
              {dn.status === 'DEAD' && focusParent && dn.link && (
                <div className="link-reason" style={{ background: 'var(--dead-bg)', borderLeftColor: 'var(--dead)', marginTop: 8 }}>
                  <span className="lbl">Originally linked by</span>
                  {linkSentence(dn.link)}
                </div>
              )}
              {!focusParent && (
                <div className="link-reason">
                  <span className="lbl">Genesis</span>
                  The seed block. Every chain in the system descends from here.
                </div>
              )}
            </div>
          );
        })()}

        {/* Hovercard: plus node */}
        {focusNode && focusIsPlus && (() => {
          const pn = focusNode as PlusNode;
          const isFork = pn.kind === 'fork-main' || pn.kind === 'fork-branch';
          const isExtendMain = pn.kind === 'extend-main';
          const klass = 'hovercard show plus-card ' + (cardBelow ? 'below' : '');
          const parentNode = byIdDeco.get(pn.parent);

          let behind = 0, toOvertake = 0, mainGraceBlocks = 0;
          if (isFork && pn.forkLag != null) {
            behind = pn.forkLag - 1;
            toOvertake = pn.forkLag + 1;
            mainGraceBlocks = Math.max(0, DEAD_LAG - pn.forkLag);
          } else if (!isExtendMain && pn.leafLag != null && pn.branchLag != null) {
            behind = pn.leafLag;
            toOvertake = pn.leafLag + 1;
            mainGraceBlocks = Math.max(0, DEAD_LAG - pn.branchLag);
          }

          return (
            <div className={klass} style={{ left: focusScreenX, top: cardTop }}>
              <div className="eyebrow">
                <span className={'branch-tag ' + (isExtendMain || isFork ? 'main' : '')}>
                  {isExtendMain ? 'Extend main' : pn.kind === 'fork-main' ? 'Fork from main' : isFork ? 'Fork from branch' : 'Extend branch'}
                </span>
                <span className="mono">OPEN</span>
              </div>
              <div className="title">
                {isExtendMain ? 'Add the next main block'
                  : isFork ? <>Fork off <span style={{ color: 'var(--accent)' }}>{parentNode?.id.slice(0, 6).toUpperCase()}</span></>
                  : 'Continue this branch'}
              </div>
              <div className="plus-body">
                {isExtendMain && parentNode && <>
                  Plant the next block at the head of the chain. Must share a word, artist, year, or genre with <b>{parentNode.t}</b>.
                </>}
                {isFork && parentNode && <>
                  Start a new branch from <b>{parentNode.t}</b>. The first block lands{' '}
                  {behind === 0 ? <>tied with main</> : <><span className="accent">{pl(behind)}</span> behind main</>}.
                  {' '}Add <span className="accent">{pl(toOvertake)}</span> total to overtake and become the new main.
                </>}
                {!isFork && !isExtendMain && <>
                  Extend this living branch. The tip is currently{' '}
                  {behind === 0 ? <>tied with main</> : <><span className="accent">{pl(behind)}</span> behind main</>}.
                  {' '}Add <span className="accent">{pl(toOvertake)}</span> more to overtake.
                </>}
              </div>
              <div className="plus-meta">
                <span>Depth &nbsp;<b>{pn.xs}</b></span>
                <span>{isExtendMain ? 'MAIN HEAD'
                  : mainGraceBlocks === 0 ? 'DIES ON NEXT MAIN BLOCK'
                  : `DIES IF MAIN ×${mainGraceBlocks} FIRST`}</span>
              </div>
              {(isFork || (!isExtendMain && !isFork)) && (
                <div className="plus-warn">
                  Longest chain wins. A branch dies once its fork point falls {DEAD_LAG} blocks behind the main head.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Bottom chrome */}
      <div className="chrome-bottom">
        <div className="legend-col">
          {ana && (() => {
            const head = byIdDeco.get(ana.mainHead.id);
            if (!head) return null;
            const q = encodeURIComponent(`${head.t} ${head.a}`);
            return (
              <div className="head-info">
                <span className="head-label">HEAD</span>
                <span className="head-song">{head.t}</span>
                <span className="head-artist">{head.a}</span>
                <div className="head-links">
                  <a href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer" className="head-btn yt">
                    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="14" height="10" rx="2" fill="currentColor"/>
                      <polygon points="5.5,2.5 5.5,7.5 10,5" fill="white"/>
                    </svg>
                    YouTube
                  </a>
                  <a href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noreferrer" className="head-btn sp">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="6" cy="6" r="6" fill="currentColor"/>
                      <path d="M3 4.5C4.8 3.9 7.5 4.1 9 5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                      <path d="M3.3 6.2C4.9 5.7 7.2 5.9 8.5 6.7" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                      <path d="M3.6 7.9C4.9 7.5 6.8 7.6 7.9 8.2" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                    Spotify
                  </a>
                </div>
              </div>
            );
          })()}
          <div className="legend">
            <span className="key"><span className="sq"></span> source</span>
            <span className="key"><span className="ci-main"></span> main</span>
            <span className="key"><span style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--ink)', display: 'inline-block' }}></span> alive</span>
            <span className="key"><span className="ci-dead"></span> dead</span>
            <span className="key"><span className="pl"></span> extend</span>
            <span className="key"><span className="pk-fork"></span> fork</span>
          </div>
        </div>

        <div className="minitree"><MiniTree /></div>

        <div className="zoom-control">
          <span>Zoom</span>
          <input
            type="range" min="0.15" max="2" step="0.01"
            value={zoom}
            onChange={e => {
              cancelAnim();
              applyZoom(parseFloat(e.target.value), viewportW / 2, viewportH / 2);
              if (!hasMoved) setHasMoved(true);
            }}
          />
          <span className="mono">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="position-readout mono">
          <b>{(readoutNode as PlusNode | undefined)?.kind
              ? ((readoutNode as PlusNode).kind === 'extend-main' ? 'EXTEND MAIN'
                : (readoutNode as PlusNode).kind === 'fork-main' ? 'FORK' : 'EXTEND')
              : readoutNode?.id.slice(0, 8).toUpperCase()}</b>
          &nbsp;·&nbsp; depth <b>{(readoutNode as DecoratedNode | undefined)?.xs ?? (readoutNode as PlusNode | undefined)?.xs ?? 0}</b>
          <span className={'br ' + ((readoutNode as DecoratedNode | undefined)?.status === 'MAIN' ? 'main'
            : (readoutNode as DecoratedNode | undefined)?.status === 'DEAD' ? 'dead' : 'alive')}>
            {(readoutNode as PlusNode | undefined)?.kind
              ? ((readoutNode as PlusNode).kind === 'fork-main' ? 'Fork bud · open'
                : (readoutNode as PlusNode).kind === 'extend-main' ? 'Main head · open'
                : 'Branch tip · open')
              : ((readoutNode as DecoratedNode | undefined)?.status === 'MAIN' ? 'Main branch'
                : (readoutNode as DecoratedNode | undefined)?.status === 'DEAD' ? 'Dead branch'
                : 'Alive branch')}
          </span>
        </div>
      </div>

      {/* Add-song modal */}
      {addingPlus && ana && byIdDeco.get(addingPlus.parent) && (
        <AddSongModal
          plus={addingPlus}
          parent={byIdDeco.get(addingPlus.parent)!}
          ancestorSongs={ancestorSongs}
          onClose={() => { setAddingPlus(null); setAddError(null); }}
          onAdd={handleAdd}
        />
      )}

      {addError && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          padding: '8px 16px', background: 'var(--dead-bg)', border: '1px solid var(--dead)',
          fontSize: 11, color: 'var(--ink)', pointerEvents: 'none' }}>
          {addError}
        </div>
      )}

      {submitting && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(250,250,247,0.6)', backdropFilter: 'blur(2px)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Adding…</span>
        </div>
      )}

      {showWelcome && <WelcomeScreen onDismiss={dismissWelcome} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seed modal (for empty tree — no parent needed)                       */
/* ------------------------------------------------------------------ */

function SeedModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (track: (ItunesTrack & { year: number | null }), addedBy: string) => void;
}) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<(ItunesTrack & { year: number | null })[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<(ItunesTrack & { year: number | null }) | null>(null);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('music_blockchain_username') ?? ''; } catch { return ''; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (name.trim()) inputRef.current?.focus();
    else nameRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
        setResults((data.results || []).map((t: ItunesTrack) => ({
          ...t,
          year: t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
        })));
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow"><span className="tag-accent">Genesis</span></div>
            <h2>Plant the seed</h2>
            <div className="sub">Choose any song to start the blockchain.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-name">
          <label htmlFor="seed-contributor-name">Your name</label>
          <input
            ref={nameRef}
            id="seed-contributor-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name…"
            maxLength={100}
          />
        </div>
        <div className="modal-search">
          <span className="icon">
            <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="9.4" y1="9.4" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <input ref={inputRef} type="text" value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search for any song…" />
          {searching && <span className="searching">Searching</span>}
        </div>
        <div className="modal-results">
          {query.trim().length < 2 && <div className="modal-empty">Search for any song to start the chain.</div>}
          {query.trim().length >= 2 && !searching && results.length === 0 && <div className="modal-empty">No results.</div>}
          {results.map(track => {
            const isChosen = selected?.trackId === track.trackId;
            return (
              <button key={track.trackId} className={'result pass ' + (isChosen ? 'selected' : '')}
                      onClick={() => setSelected(isChosen ? null : track)}>
                {track.artworkUrl100
                  ? <span className="art"><img src={track.artworkUrl100} alt="" /></span>
                  : <span className="art-fallback">♪</span>}
                <span className="info">
                  <span className="t">{track.trackName}</span>
                  <span className="a">{track.artistName} · {track.primaryGenreName} · {track.year ?? '—'}</span>
                </span>
                <span className="badge">seed</span>
              </button>
            );
          })}
        </div>
        <div className="modal-foot">
          <div className="actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!selected || !name.trim()} onClick={() => {
              if (!selected || !name.trim()) return;
              const trimmedName = name.trim();
              try { localStorage.setItem('music_blockchain_username', trimmedName); } catch {}
              onAdd(selected, trimmedName);
            }}>
              Plant this Song
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
