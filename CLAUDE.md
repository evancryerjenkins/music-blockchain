# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via Next.js config
```

No test suite exists yet.

## Environment

Copy `.env.local.example` to `.env.local` and fill in Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Both are `NEXT_PUBLIC_` — safe to expose in the browser. Obtain from Supabase **Settings → API**.

## Architecture

**Music Blockchain** is a collaborative music tree app. Users build a growing tree of songs where each song must connect to its parent via one shared word in title, artist name, genre, or release year. The tree renders in real-time with D3.js.

### Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** — PostgreSQL + realtime subscriptions (pushes new nodes to all clients)
- **D3.js 7** — custom tree visualization
- **iTunes Search API** — free, no key required, proxied via `/api/search`

### Key Files

| Path | Role |
|------|------|
| `src/app/page.tsx` | 1000+ line client component: tree state, D3 rendering, Supabase subscription |
| `src/components/AddSongModal.tsx` | Search iTunes, validate connection, submit new node |
| `src/app/api/nodes/route.ts` | GET all nodes / POST new node with similarity validation |
| `src/app/api/search/route.ts` | Proxy to iTunes Search API |
| `src/lib/similarity.ts` | `checkSimilarity()` — the core connection validation logic |
| `src/lib/types.ts` | `MusicNode`, `ItunesTrack`, `SimilarityResult` |
| `supabase/schema.sql` | DB schema + RLS policies (public read + insert, no auth) |

### Data Flow

1. On mount, `page.tsx` fetches all nodes via `GET /api/nodes` and subscribes to Supabase realtime on `music_nodes`.
2. User clicks a "+" node → `AddSongModal` opens with the parent node as context.
3. User searches iTunes (debounced 320ms) → `/api/search` proxies results.
4. User selects a track → `POST /api/nodes` validates similarity server-side via `checkSimilarity()`.
5. On success, the realtime subscription delivers the new node to all connected clients.

### Similarity Logic (`src/lib/similarity.ts`)

`checkSimilarity()` accepts parent + candidate fields and returns `{ matches, reasons[] }`. Four criteria:
- **Title word**: significant words (length > 1, not in STOP_WORDS) overlap between titles
- **Artist word**: same word-overlap check on artist names
- **Genre**: case-insensitive exact or substring match
- **Year**: exact year match

### Tree Visualization (`src/app/page.tsx`)

Raw `MusicNode[]` is analyzed into an internal tree structure that classifies each node as MAIN (longest path), ALIVE (branch < 3 behind main head), or DEAD. D3 lays nodes out with depth on the x-axis and computed lane on the y-axis. "+" buttons appear at extendable positions: the main chain head, up to 2 recent fork points on the main path, and leaves of alive branches.

## AI Coding Guidelines (Karpathy)

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
