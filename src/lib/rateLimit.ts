// Module-level store. Resets on cold start; sufficient to limit burst attacks
// within a single serverless instance.
const store = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = store.get(key) ?? [];
  const hits = prev.filter(t => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  store.set(key, hits);
  return true;
}
