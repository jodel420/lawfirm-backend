-- ============================================================================
-- Aniceta Law Firm — Supabase Schema (Complete)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. Attorneys
create table if not exists attorneys (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  role            text default '',
  specialty       text default '',
  image           text default '',
  linkedin        text default '',
  twitter         text default '',
  email           text default '',
  contact_number  text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
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

-- 6. Admins (super admin + admin accounts)
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  email         text not null unique,
  password_hash text not null,
  full_name     text default '',
  role          text default 'super_admin' check (role in ('super_admin', 'admin')),
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 7. Lawyer accounts (linked to attorneys)
create table if not exists lawyer_accounts (
  id            uuid primary key default gen_random_uuid(),
  attorney_id   uuid not null references attorneys(id) on delete cascade,
  email         text not null unique,
  password_hash text not null,
  is_active     boolean default true,
  last_login    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 8. Lawyer notes (personal notes, agenda, case status)
create table if not exists lawyer_notes (
  id          uuid primary key default gen_random_uuid(),
  attorney_id uuid not null references attorneys(id) on delete cascade,
  title       text not null default '',
  content     text default '',
  category    text default 'note' check (category in ('note', 'agenda', 'case_status', 'reminder')),
  status      text default 'active' check (status in ('active', 'completed', 'archived')),
  due_date    timestamptz,
  priority    text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_lawyer_accounts_attorney on lawyer_accounts(attorney_id);
create index if not exists idx_lawyer_notes_attorney on lawyer_notes(attorney_id);
create index if not exists idx_lawyer_notes_category on lawyer_notes(category);
create index if not exists idx_lawyer_notes_status on lawyer_notes(status);

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
create or replace trigger admins_updated_at
  before update on admins for each row execute function update_updated_at();
create or replace trigger lawyer_accounts_updated_at
  before update on lawyer_accounts for each row execute function update_updated_at();
create or replace trigger lawyer_notes_updated_at
  before update on lawyer_notes for each row execute function update_updated_at();

-- ── Row-Level Security (allow all via service_role key from backend) ────────
alter table attorneys       enable row level security;
alter table practice_areas  enable row level security;
alter table about           enable row level security;
alter table posts           enable row level security;
alter table newsletters     enable row level security;
alter table admins          enable row level security;
alter table lawyer_accounts enable row level security;
alter table lawyer_notes    enable row level security;

create policy "Allow all for service role" on attorneys       for all using (true) with check (true);
create policy "Allow all for service role" on practice_areas  for all using (true) with check (true);
create policy "Allow all for service role" on about           for all using (true) with check (true);
create policy "Allow all for service role" on posts           for all using (true) with check (true);
create policy "Allow all for service role" on newsletters     for all using (true) with check (true);
create policy "Allow all for service role" on admins          for all using (true) with check (true);
create policy "Allow all for service role" on lawyer_accounts for all using (true) with check (true);
create policy "Allow all for service role" on lawyer_notes    for all using (true) with check (true);

-- ── Storage: Create public "images" bucket ──────────────────────────────────
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "Public read access" on storage.objects
  for select using (bucket_id = 'images');
create policy "Service role upload" on storage.objects
  for insert with check (bucket_id = 'images');
create policy "Service role delete" on storage.objects
  for delete using (bucket_id = 'images');
