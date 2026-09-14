import { NextRequest } from 'next/server';

// Diagnostic routes are gated on a shared secret and 404 (not 403) without it, so
// they are indistinguishable from a route that does not exist. With DEBUG_SECRET
// unset — the default — they are unreachable entirely.
export function isDebugAuthorised(req: NextRequest): boolean {
  const secret = process.env.DEBUG_SECRET;
  return !!secret && req.headers.get('x-debug-secret') === secret;
}
