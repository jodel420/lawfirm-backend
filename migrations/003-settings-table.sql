-- Settings table (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  value      text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON settings FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default token expiry
INSERT INTO settings (key, value) VALUES ('token_expiry', '7d') ON CONFLICT (key) DO NOTHING;
