-- Provision the brand-logos storage bucket for tenant logo uploads.
--
-- SECURITY MODEL (why this migration touches only storage.buckets):
--   * Writes are performed exclusively server-side by the service role
--     (supabaseAdmin) through /api/client/upload-logo. The service role
--     BYPASSES row-level security, so no INSERT/UPDATE policy is needed.
--   * The bucket is PUBLIC, so Supabase's storage layer serves objects to
--     browsers via stable public URLs without a SELECT policy or signed tokens.
--   * Explicit RLS policies on storage.objects are intentionally omitted here:
--     in current Supabase versions storage.objects is owned by
--     supabase_storage_admin, not the migration role, so ALTER/CREATE POLICY
--     on it fails with "must be owner of table objects". If deeper
--     defense-in-depth is desired later, add those policies by running them
--     as a superuser in the Supabase SQL Editor — they are optional, not
--     required for the upload/serve flow to function.

-- Create the bucket (idempotent; safe to re-run).
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'brand-logos',
  'brand-logos',
  true,
  5242880                               -- 5 MB hard cap (mirrors the API route gate)
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;
