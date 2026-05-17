import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN!,
});

const localWindows = new Map<string, { count: number; resetAt: number }>();

// Hybrid local-first rate limiter.
// Local counter handles requests well under the limit with no Redis calls.
// Redis is only consulted when the local count reaches the limit, providing
// an authoritative cross-instance check only when it matters.
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const redisKey = `rl:${key}`;
  const entry = localWindows.get(key);

  if (!entry || now > entry.resetAt) {
    localWindows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  entry.count++;

  if (entry.count < limit) {
    return true;
  }

  // Local count is at or over the limit — check Redis for the authoritative count.
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSeconds);
  return count <= limit;
}
