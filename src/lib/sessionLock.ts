import { redis } from './rateLimit';

export async function acquireSessionLock(token: string): Promise<boolean> {
  const result = await redis.set('slock:' + token, '1', { nx: true, ex: 10 });
  return result === 'OK';
}

export async function releaseSessionLock(token: string): Promise<void> {
  await redis.del('slock:' + token);
}
