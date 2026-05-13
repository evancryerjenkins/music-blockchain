# Music Blockchain 🎵

A collaborative music tree where every song must connect to the last. Users build a living tree of songs, where each new song must share a word in the title, artist name, genre, or release year with its parent.

## Features

- 🌳 **Interactive tree** — pan, zoom, and explore the growing music graph
- 🔗 **Connection rules** — songs must link via title word, artist, genre, or year
- 🎨 **Branch colours** — each fork gets a unique colour so branches are instantly visible
- 🔒 **Branch depth limit** — branches lock at 3 nodes deep
- 🎧 **30-second previews** — listen to tracks directly in the app
- ⚡ **Real-time updates** — new songs appear instantly for all visitors

## Tech stack

- **Next.js 14** (App Router) — framework
- **D3.js** — tree visualisation
- **Supabase** — PostgreSQL database + realtime subscriptions
- **iTunes Search API** — free music metadata (no key required)
- **Vercel** — hosting

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/music-blockchain.git
cd music-blockchain
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. In the **SQL Editor**, run the contents of [`supabase/schema.sql`](./supabase/schema.sql)
4. In **Project Settings → API**, copy your **Project URL** and **anon public** key

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel (free hosting)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import `music-blockchain`
3. Add environment variables (same as `.env.local`) in the Vercel project settings
4. Deploy — Vercel auto-deploys on every push to `main`

---

## How it works

- The **root node** can be any song (planted by the first visitor)
- Every subsequent node must share at least one of:
  - A significant word in the **song title**
  - A word in the **artist name**
  - The same **genre**
  - The same **release year**
- Branches lock once they reach **3 nodes deep** — encouraging forks rather than single long chains
- The tree grows in real-time; all visitors see additions immediately
