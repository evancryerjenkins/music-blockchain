'use client';

import { useEffect, useRef, useCallback } from 'react';
import { MusicNode } from '@/lib/types';

interface Props {
  nodes: MusicNode[];
  selectedId: string | null;
  onNodeClick: (node: MusicNode) => void;
}

const BRANCH_COLORS = [
  '#8B5CF6', '#EC4899', '#06B6D4', '#10B981',
  '#F59E0B', '#EF4444', '#3B82F6', '#84CC16',
];

const NODE_R = 32;
const MAX_DEPTH = 3;

export default function MusicTree({ nodes, selectedId, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  const draw = useCallback(async () => {
    if (!svgRef.current || nodes.length === 0) return;

    const d3 = await import('d3');
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 700;

    // Defs — filters and gradients
    const defs = svg.append('defs');

    // Glow filter
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Strong glow for selected
    const strongGlow = defs.append('filter').attr('id', 'glow-strong').attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
    strongGlow.append('feGaussianBlur').attr('stdDeviation', '10').attr('result', 'coloredBlur');
    const feMerge2 = strongGlow.append('feMerge');
    feMerge2.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

    // Build map and hierarchy
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const root = nodes.find(n => !n.parent_id);
    if (!root) return;

    interface TreeDatum extends MusicNode {
      children?: TreeDatum[];
    }

    function buildTree(node: MusicNode): TreeDatum {
      const children = nodes.filter(n => n.parent_id === node.id);
      return { ...node, children: children.length ? children.map(buildTree) : undefined };
    }

    const hierarchyRoot = d3.hierarchy<TreeDatum>(buildTree(root));
    const treeLayout = d3.tree<TreeDatum>().nodeSize([100, 200]);
    const pointRoot = treeLayout(hierarchyRoot);

    // Assign branch colors (by root's direct children subtrees)
    const colorMap = new Map<string, string>();
    colorMap.set(root.id, '#ffffff');
    const rootChildren = pointRoot.children || [];
    rootChildren.forEach((child, i) => {
      child.each(n => colorMap.set(n.data.id, BRANCH_COLORS[i % BRANCH_COLORS.length]));
    });

    const g = svg.append('g').attr('class', 'tree-root');

    // Zoom + pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3])
      .on('zoom', ev => g.attr('transform', ev.transform.toString()));
    svg.call(zoom).on('dblclick.zoom', null);

    // Draw edges
    g.selectAll<SVGPathElement, d3.HierarchyLink<TreeDatum>>('.edge')
      .data(pointRoot.links())
      .join('path')
      .attr('class', 'edge')
      .attr('fill', 'none')
      .attr('stroke', d => colorMap.get(d.target.data.id) ?? '#444')
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)')
      .attr('d', d3.linkVertical<d3.HierarchyLink<TreeDatum>, d3.HierarchyPointNode<TreeDatum>>()
        .x(n => (n as d3.HierarchyPointNode<TreeDatum>).x)
        .y(n => (n as d3.HierarchyPointNode<TreeDatum>).y));

    // Draw nodes
    const nodeGroups = g.selectAll<SVGGElement, d3.HierarchyPointNode<TreeDatum>>('.node')
      .data(pointRoot.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_ev, d) => onNodeClickRef.current(nodeMap.get(d.data.id)!));

    const color = (d: d3.HierarchyPointNode<TreeDatum>) => colorMap.get(d.data.id) ?? '#888';
    const isLocked = (d: d3.HierarchyPointNode<TreeDatum>) => d.data.depth >= MAX_DEPTH;
    const isSelected = (d: d3.HierarchyPointNode<TreeDatum>) => d.data.id === selectedId;

    // Pulse ring for selectable nodes
    nodeGroups.filter(d => !isLocked(d) && !isSelected(d))
      .append('circle')
      .attr('r', NODE_R + 8)
      .attr('fill', 'none')
      .attr('stroke', d => color(d))
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .attr('class', 'pulse-ring-el');

    // Selected glow ring
    nodeGroups.filter(d => isSelected(d))
      .append('circle')
      .attr('r', NODE_R + 12)
      .attr('fill', 'none')
      .attr('stroke', d => color(d))
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow-strong)')
      .attr('opacity', 0.9);

    // Outer ring
    nodeGroups.append('circle')
      .attr('r', NODE_R + 4)
      .attr('fill', 'none')
      .attr('stroke', d => color(d))
      .attr('stroke-width', d => isSelected(d) ? 3 : 1.5)
      .attr('stroke-opacity', d => isLocked(d) ? 0.25 : 0.7)
      .attr('filter', d => isSelected(d) ? 'url(#glow-strong)' : 'url(#glow)');

    // Background circle
    nodeGroups.append('circle')
      .attr('r', NODE_R)
      .attr('fill', '#0d0d24')
      .attr('stroke', d => color(d))
      .attr('stroke-width', 2)
      .attr('opacity', d => isLocked(d) ? 0.45 : 1);

    // Album art via clipPath + image
    nodeGroups.each(function (d) {
      if (!d.data.album_art) return;
      const group = d3.select<SVGGElement, d3.HierarchyPointNode<TreeDatum>>(this);
      const clipId = `clip-${d.data.id}`;
      defs.append('clipPath').attr('id', clipId)
        .append('circle').attr('r', NODE_R - 2);
      group.append('image')
        .attr('href', d.data.album_art)
        .attr('x', -(NODE_R - 2)).attr('y', -(NODE_R - 2))
        .attr('width', (NODE_R - 2) * 2).attr('height', (NODE_R - 2) * 2)
        .attr('clip-path', `url(#${clipId})`)
        .attr('opacity', d.data.depth >= MAX_DEPTH ? 0.4 : 1);
    });

    // Music note icon for nodes without art
    nodeGroups.filter(d => !d.data.album_art)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '22px')
      .attr('opacity', d => isLocked(d) ? 0.3 : 0.6)
      .text('♪');

    // Lock icon overlay for locked nodes
    nodeGroups.filter(d => isLocked(d))
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '18px')
      .attr('fill', '#aaa')
      .attr('opacity', 0.7)
      .text('🔒');

    // Song title label
    nodeGroups.append('text')
      .attr('y', NODE_R + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', d => isLocked(d) ? '#555' : '#e0e0ff')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'Inter, sans-serif')
      .text(d => {
        const t = d.data.song_title;
        return t.length > 18 ? t.slice(0, 17) + '…' : t;
      });

    // Artist label
    nodeGroups.append('text')
      .attr('y', NODE_R + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', d => isLocked(d) ? '#333' : '#6666aa')
      .attr('font-size', '10px')
      .attr('font-family', 'Inter, sans-serif')
      .text(d => {
        const a = d.data.artist;
        return a.length > 18 ? a.slice(0, 17) + '…' : a;
      });

    // Hover behaviour — add green ring on hover for non-locked nodes
    nodeGroups.filter(d => !isLocked(d))
      .on('mouseenter', function (_ev, d) {
        d3.select(this).select('.pulse-ring-el')
          .transition().duration(200)
          .attr('opacity', 0.5)
          .attr('r', NODE_R + 14);
      })
      .on('mouseleave', function (_ev, d) {
        d3.select(this).select('.pulse-ring-el')
          .transition().duration(300)
          .attr('opacity', 0)
          .attr('r', NODE_R + 8);
      });

    // Center tree
    const treeBounds = (g.node() as SVGGElement)?.getBBox();
    if (treeBounds) {
      const padding = 120;
      const scale = Math.min(
        (width - padding) / Math.max(treeBounds.width, 1),
        (height - padding) / Math.max(treeBounds.height, 1),
        1
      );
      const tx = width / 2 - scale * (treeBounds.x + treeBounds.width / 2);
      const ty = padding / 2 - scale * treeBounds.y;
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
  }, [nodes, selectedId]);

  useEffect(() => { draw(); }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (svgRef.current) ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <svg
      ref={svgRef}
      className="tree-svg w-full h-full"
      style={{ display: 'block' }}
    />
  );
}
