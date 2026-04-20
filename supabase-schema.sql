-- ============================================================================
-- Aniceta Law Firm — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. Attorneys
create table if not exists attorneys (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text default '',
  specialty  text default '',
  image      text default '',
  linkedin   text default '',
  twitter    text default '',
  email      text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Practice Areas
create table if not exists practice_areas (
  id         uuid primary key default gen_random_uuid(),
  icon       text default 'FaGavel',
  title      text not null,
  "desc"     text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. About (singleton row)
create table if not exists about (
  id         uuid primary key default gen_random_uuid(),
  image      text default '',
  heading    text default E'Committed To Helping\nOur Clients Succeed',
  paragraph1 text default '',
  paragraph2 text default '',
  bullets    text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Posts (blog)
create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text default 'General',
  date       text default '',
  excerpt    text default '',
  image      text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Newsletters
create table if not exists newsletters (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz default now()
);

-- ── Auto-update updated_at trigger ──────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger attorneys_updated_at
  before update on attorneys for each row execute function update_updated_at();

create or replace trigger practice_areas_updated_at
  before update on practice_areas for each row execute function update_updated_at();

create or replace trigger about_updated_at
  before update on about for each row execute function update_updated_at();

create or replace trigger posts_updated_at
  before update on posts for each row execute function update_updated_at();

-- ── Row-Level Security (allow all via service_role key from backend) ────────
alter table attorneys      enable row level security;
alter table practice_areas enable row level security;
alter table about          enable row level security;
alter table posts          enable row level security;
alter table newsletters    enable row level security;

create policy "Allow all for service role" on attorneys      for all using (true) with check (true);
create policy "Allow all for service role" on practice_areas for all using (true) with check (true);
create policy "Allow all for service role" on about          for all using (true) with check (true);
create policy "Allow all for service role" on posts          for all using (true) with check (true);
create policy "Allow all for service role" on newsletters    for all using (true) with check (true);
