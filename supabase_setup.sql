-- FinanceIQ — Supabase setup
-- Run this in your Supabase project → SQL Editor → New query

-- ── 1. Persistent cache (replaces in-memory cache.py) ────────────────────────
-- Survives PM2 restarts. All 2-min/3-min/30-min cached data persists.

create table if not exists cache (
  key        text        primary key,
  value      jsonb       not null,
  created_at timestamptz not null default now()
);

-- Clean up entries older than 24 hours (run periodically or via cron)
-- delete from cache where created_at < now() - interval '24 hours';


-- ── 2. Chat session history ───────────────────────────────────────────────────
-- Persists research chat conversations across page refreshes and restarts.

create table if not exists chat_sessions (
  id         uuid        primary key default gen_random_uuid(),
  ticker     text        not null,
  title      text,                        -- auto-generated from first message
  messages   jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_ticker_idx on chat_sessions (ticker);
create index if not exists chat_sessions_updated_at_idx on chat_sessions (updated_at desc);


-- ── 3. Scanner results history ────────────────────────────────────────────────
-- Stores every Top 20 scan so you can track how signals change over time.

create table if not exists scan_results (
  id          uuid        primary key default gen_random_uuid(),
  timeframe   text        not null,
  bullish     jsonb       not null default '[]'::jsonb,
  bearish     jsonb       not null default '[]'::jsonb,
  scanned     integer     not null default 0,
  scanned_at  timestamptz not null default now()
);

create index if not exists scan_results_timeframe_idx on scan_results (timeframe, scanned_at desc);


-- ── 4. pgvector news embeddings (for future RAG) ─────────────────────────────
-- Stores embedded news headlines for semantic search across your news history.
-- Requires the pgvector extension (enabled by default in Supabase).

create extension if not exists vector;

create table if not exists news_embeddings (
  id           uuid        primary key default gen_random_uuid(),
  ticker       text        not null,
  headline     text        not null,
  summary      text,
  source       text,
  sentiment    text,                      -- 'positive' | 'negative' | 'neutral'
  embedding    vector(384),               -- all-MiniLM-L6-v2 or nomic-embed-text
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists news_embeddings_ticker_idx on news_embeddings (ticker);
-- Vector similarity index (add after you have data):
-- create index on news_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- ── Row Level Security (optional but recommended) ────────────────────────────
-- Since you're using the service role key from the backend, RLS is bypassed.
-- Enable if you ever add user auth.

-- alter table cache            enable row level security;
-- alter table chat_sessions    enable row level security;
-- alter table scan_results     enable row level security;
-- alter table news_embeddings  enable row level security;
