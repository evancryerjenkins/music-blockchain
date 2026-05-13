'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MusicNode } from '@/lib/types';
import { checkSimilarity } from '@/lib/similarity';
import AddSongModal from '@/components/AddSongModal';
import NodeInfoPanel from '@/components/NodeInfoPanel';
import StarField from '@/components/StarField';

const MusicTree = dynamic(() => import('@/components/MusicTree'), { ssr: false });

const BRANCH_COLORS = ['#8B5CF6','#EC4899','#06B6D4','#10B981','#F59E0B','#EF4444','#3B82F6','#84CC16'];

export default function HomePage() {
  const [nodes, setNodes] = useState<MusicNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<MusicNode | null>(null);
  const [addingAfter, setAddingAfter] = useState<MusicNode | null | 'root'>( null);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      const data = await res.json();
      if (res.ok) setNodes(data.nodes || []);
      else setError(data.error);
    } catch {
      setError('Failed to load the music tree.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  // Supabase realtime subscription
  useEffect(() => {
    let sub: ReturnType<typeof setTimeout> | null = null;
    async function subscribe() {
      try {
        const { supabase } = await import('@/lib/supabase');
        const channel = supabase
          .channel('music_nodes_changes')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'music_nodes' }, payload => {
            setNodes(prev => {
              if (prev.find(n => n.id === (payload.new as MusicNode).id)) return prev;
              return [...prev, payload.new as MusicNode];
            });
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      } catch { /* supabase not configured, no realtime */ }
    }
    subscribe();
    return () => { if (sub) clearTimeout(sub); };
  }, []);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const rootNode = nodes.find(n => !n.parent_id);

  // Branch color map (same logic as MusicTree component)
  const colorMap = new Map<string, string>();
  if (rootNode) {
    colorMap.set(rootNode.id, '#ffffff');
    const rootChildren = nodes.filter(n => n.parent_id === rootNode.id);
    rootChildren.forEach((child, i) => {
      function colorSubtree(nodeId: string, color: string) {
        colorMap.set(nodeId, color);
        nodes.filter(n => n.parent_id === nodeId).forEach(n => colorSubtree(n.id, color));
      }
      colorSubtree(child.id, BRANCH_COLORS[i % BRANCH_COLORS.length]);
    });
  }

  // Connection reasons for selected node
  const selectedParent = selectedNode?.parent_id ? nodeMap.get(selectedNode.parent_id) : null;
  const connectionReasons = selectedNode && selectedParent
    ? checkSimilarity(
        selectedParent,
        selectedNode.song_title,
        selectedNode.artist,
        selectedNode.genre,
        selectedNode.year
      ).reasons
    : [];

  const childCount = selectedNode ? nodes.filter(n => n.parent_id === selectedNode.id).length : 0;

  function handleNodeAdded(node: MusicNode) {
    setNodes(prev => prev.find(n => n.id === node.id) ? prev : [...prev, node]);
    setAddingAfter(null);
    setSelectedNode(node);
  }

  // Stats
  const totalBranches = rootNode ? nodes.filter(n => n.parent_id === rootNode.id).length : 0;
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#04040e' }}>
      <StarField />

      {/* Header */}
      <header
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: 'linear-gradient(180deg, rgba(4,4,14,0.95) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎵</div>
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#e0e0ff' }}>
              Music Blockchain
            </h1>
            <p className="text-xs" style={{ color: '#5555aa' }}>Every song must connect to the last</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          {nodes.length > 0 && (
            <div className="hidden sm:flex items-center gap-4 text-xs" style={{ color: '#7878a8' }}>
              <span><b style={{ color: '#a090e8' }}>{nodes.length}</b> songs</span>
              <span><b style={{ color: '#a090e8' }}>{totalBranches}</b> branches</span>
              <span><b style={{ color: '#a090e8' }}>{maxDepth}</b> deep</span>
            </div>
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              {BRANCH_COLORS.slice(0, Math.min(totalBranches, 6)).map((c, i) => (
                <div key={i} className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
              ))}
              {totalBranches > 6 && <span className="text-xs" style={{ color: '#5555aa' }}>+{totalBranches - 6}</span>}
            </div>
          )}

          {/* Help tooltip */}
          <div className="relative group">
            <button className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              ?
            </button>
            <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-xl text-xs opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20"
              style={{ background: 'rgba(13,13,36,0.98)', border: '1px solid rgba(139,92,246,0.3)', color: '#9090cc' }}>
              <p className="font-semibold mb-2" style={{ color: '#c0b0ff' }}>How to play</p>
              <ol className="space-y-1 list-decimal pl-3">
                <li>Click any node to see the song</li>
                <li>Click &ldquo;Add a song after this&rdquo;</li>
                <li>Search and pick a song that connects via title, artist, genre, or year</li>
                <li>Branches lock after 3 nodes deep</li>
              </ol>
            </div>
          </div>
        </div>
      </header>

      {/* Tree area */}
      <div className="absolute inset-0 z-0">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">🎵</div>
              <p style={{ color: '#5555aa' }}>Loading the music tree…</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-full">
            <div className="glass-card p-6 rounded-2xl max-w-sm text-center" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
              <p className="text-2xl mb-3">⚠️</p>
              <p className="text-sm mb-4" style={{ color: '#f87171' }}>{error}</p>
              <p className="text-xs" style={{ color: '#7878a8' }}>Make sure your Supabase environment variables are set in <code>.env.local</code>.</p>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm px-6">
              <div className="text-6xl mb-6 animate-float">🌱</div>
              <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#e0e0ff' }}>
                The tree is empty
              </h2>
              <p className="text-sm mb-6" style={{ color: '#7878a8' }}>
                Be the first to plant a seed. Pick any song to start the music blockchain.
              </p>
              <button
                onClick={() => setAddingAfter('root')}
                className="px-6 py-3 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                  color: '#fff',
                  boxShadow: '0 0 30px rgba(139,92,246,0.5)',
                }}
              >
                Plant the Seed 🌱
              </button>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <MusicTree
            nodes={nodes}
            selectedId={selectedNode?.id ?? null}
            onNodeClick={node => setSelectedNode(prev => prev?.id === node.id ? null : node)}
          />
        )}
      </div>

      {/* Floating "Plant seed" button when tree exists */}
      {!loading && nodes.length > 0 && (
        <button
          onClick={() => setAddingAfter('root')}
          className="absolute bottom-6 right-6 z-10 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
            color: '#fff',
            boxShadow: '0 0 20px rgba(139,92,246,0.4)',
          }}
          title="Add a song at the root"
        >
          <span>+</span>
          <span className="hidden sm:inline">Add Root Song</span>
        </button>
      )}

      {/* Node info panel */}
      {selectedNode && (
        <div className="absolute right-4 top-20 bottom-4 z-10 flex items-start" style={{ maxHeight: 'calc(100vh - 96px)' }}>
          <NodeInfoPanel
            node={selectedNode}
            parentNode={selectedParent ?? null}
            childCount={childCount}
            connectionReasons={connectionReasons}
            onAddAfter={() => setAddingAfter(selectedNode)}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}

      {/* Add song modal */}
      {addingAfter !== null && (
        <AddSongModal
          parentNode={addingAfter === 'root' ? null : addingAfter}
          isRoot={addingAfter === 'root'}
          onClose={() => setAddingAfter(null)}
          onAdded={handleNodeAdded}
        />
      )}
    </div>
  );
}
