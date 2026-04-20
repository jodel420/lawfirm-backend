-- ============================================================================
-- Migration 002: Admin table, lawyer accounts, lawyer notes/agenda
-- Run in Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- 1. Add contact_number to attorneys table
ALTER TABLE attorneys ADD COLUMN IF NOT EXISTS contact_number text DEFAULT '';

-- 2. Admins table (replaces env-based admin login)
CREATE TABLE IF NOT EXISTS admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text DEFAULT '',
  role          text DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'admin')),
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 3. Lawyer accounts (linked to attorneys)
CREATE TABLE IF NOT EXISTS lawyer_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_id   uuid NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active     boolean DEFAULT true,
  last_login    timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 4. Lawyer notes (personal notes, agenda, status tracking)
CREATE TABLE IF NOT EXISTS lawyer_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_id   uuid NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT '',
  content       text DEFAULT '',
  category      text DEFAULT 'note' CHECK (category IN ('note', 'agenda', 'case_status', 'reminder')),
  status        text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  due_date      timestamptz,
  priority      text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lawyer_accounts_attorney ON lawyer_accounts(attorney_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_notes_attorney ON lawyer_notes(attorney_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_notes_category ON lawyer_notes(category);
CREATE INDEX IF NOT EXISTS idx_lawyer_notes_status ON lawyer_notes(status);

-- ── Auto-update updated_at triggers ───────────────────────────────────────────
CREATE OR REPLACE TRIGGER admins_updated_at
  BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER lawyer_accounts_updated_at
  BEFORE UPDATE ON lawyer_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER lawyer_notes_updated_at
  BEFORE UPDATE ON lawyer_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawyer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawyer_notes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON admins          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON lawyer_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON lawyer_notes    FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: Create default super admin ──────────────────────────────────────────
-- Password: admin123 (bcrypt hash)
INSERT INTO admins (username, email, password_hash, full_name, role)
VALUES (
  'admin',
  'jodelvillena15@gmail.com',
  '$2a$10$AP.sX43GkBeuBucopZ5NK.tyzHGLpFuhjz1eVG92OegarqDALfvy.',
  'Super Admin',
  'super_admin'
)
ON CONFLICT (username) DO NOTHING;
