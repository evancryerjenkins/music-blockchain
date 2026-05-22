import { MusicNode } from './types';

export function getMainChain(nodes: MusicNode[]): MusicNode[] {
  if (!nodes.length) return [];
  const root = nodes.find(n => !n.parent_id);
  if (!root) return [];

  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_id) {
      const list = children.get(n.parent_id) ?? [];
      list.push(n.id);
      children.set(n.parent_id, list);
    }
  }

  const longestFrom = (id: string): string[] => {
    const kids = children.get(id) ?? [];
    if (!kids.length) return [id];
    let best: string[] = [];
    for (const k of kids) {
      const path = longestFrom(k);
      if (path.length > best.length) best = path;
    }
    return [id, ...best];
  };

  return longestFrom(root.id).map(id => byId.get(id)!);
}
