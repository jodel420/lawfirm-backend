-- ============================================================================
-- Migration 004 — Hearings / Hearing Calendar
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- Table
create table if not exists hearings (
  id            uuid        primary key default gen_random_uuid(),
  attorney_id   uuid        not null references attorneys(id) on delete cascade,
  case_title    text        not null default '',
  case_number   text        not null default '',
  court         text        not null default '',
  hearing_date  date        not null,
  hearing_time  text        not null default '',
  hearing_type  text        not null default 'Pre-Trial'
                            check (hearing_type in (
                              'Pre-Trial', 'Trial', 'Promulgation', 'Arraignment',
                              'Preliminary Investigation', 'Mediation', 'Appeal', 'Other'
                            )),
  status        text        not null default 'Scheduled'
                            check (status in ('Scheduled', 'Reset', 'Done', 'Cancelled')),
  notes         text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_hearings_attorney    on hearings(attorney_id);
create index if not exists idx_hearings_date        on hearings(hearing_date);
create index if not exists idx_hearings_status      on hearings(status);

-- Auto-update updated_at
create or replace trigger hearings_updated_at
  before update on hearings
  for each row execute function update_updated_at();

-- Row-Level Security (service role key used by the backend bypasses this)
alter table hearings enable row level security;
create policy "Allow all for service role" on hearings
  for all using (true) with check (true);
