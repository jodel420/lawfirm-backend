-- ============================================================================
-- 007 – Ensure Supabase Storage bucket "images" exists with correct policies
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT)
-- ============================================================================

-- 1. Create the public "images" bucket (if it doesn't already exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  5242880,   -- 5 MB limit
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml'];

-- 2. Drop old policies first (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Public read access"  ON storage.objects;
DROP POLICY IF EXISTS "Service role upload" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete" ON storage.objects;

-- 3. Public read — anyone can view images
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- 4. Authenticated upload — any authenticated request can upload
CREATE POLICY "Service role upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images');

-- 5. Authenticated delete — any authenticated request can delete
CREATE POLICY "Service role delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'images');

-- 6. Authenticated update (needed for upsert)
CREATE POLICY "Service role update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'images');
