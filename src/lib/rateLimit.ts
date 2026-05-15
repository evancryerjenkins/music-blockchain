interface Bucket {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  capacity: number,
  refillRate: number,   // tokens per second
): boolean {
  const now = Date.now();
  const bucket = store.get(key) ?? { tokens: capacity, lastRefill: now };

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    store.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  store.set(key, bucket);
  return true;
}
