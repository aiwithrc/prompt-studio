-- Prompt Studio schema v1. Applied in order by scripts/migrate.mjs.
create extension if not exists vector;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  default_mode text not null default 'ai' check (default_mode in ('ai','template')),
  top_k int not null default 4 check (top_k between 1 and 10),
  show_scores boolean not null default true,
  kid_safe_default boolean not null default true,
  active_provider text not null default 'lmstudio',
  embedding_provider text not null default 'lmstudio',
  embedding_model text not null default '',
  embedding_dim int not null default 0,
  created_at timestamptz not null default now()
);

-- One row per configured provider. api_key_enc is AES-256-GCM encrypted; never returned to the client.
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  base_url text,
  model text,
  api_key_enc text,
  api_key_hint text,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists engine_sections (
  user_id uuid not null references users(id) on delete cascade,
  section text not null check (section in ('base','video','image','text','linkedin')),
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('video','image','text','linkedin')),
  mode text not null check (mode in ('ai','template')),
  prompt text not null,
  negative text not null default '',
  width int, height int, frames int,
  idea text not null default '',
  ref_desc text not null default '',
  fields jsonb not null default '{}',
  neg_input text not null default '',
  collection text not null default '',
  tags text[] not null default '{}',
  favourite boolean not null default false,
  rating smallint not null default 0 check (rating in (-1,0,1)),
  uses int not null default 0,
  last_used_at timestamptz,
  provider text,
  model text,
  embedding vector,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prompts_user_created on prompts (user_id, created_at desc);

create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  labels text[] not null default '{}',
  mime text not null default 'text/plain',
  char_count int not null default 0,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_sources_labels on knowledge_sources using gin (labels);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  ordinal int not null,
  content text not null,
  token_count int not null,
  embedding vector,
  embedding_model text,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_chunks_fts on knowledge_chunks using gin (fts);
create index if not exists knowledge_chunks_user_source on knowledge_chunks (user_id, source_id);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  prompt_id uuid references prompts(id) on delete set null,
  type text not null,
  mode text not null,
  provider text,
  model text,
  request jsonb not null,
  hit_ids jsonb not null default '[]',
  output text,
  negative text,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists password_resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false
);
