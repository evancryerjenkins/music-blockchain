import { NextRequest } from 'next/server';

export function getIp(req: NextRequest): string {
  // x-real-ip is set by Vercel's edge network and cannot be spoofed by the client.
  // Fall back to the LAST entry of x-forwarded-for (added by the closest proxy),
  // not the first (which the client can inject arbitrarily).
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown'
  );
}
