-- Provision the widget-assets storage bucket for header/footer/widget background
-- and other large branding assets uploaded via /api/client/upload-asset and
-- /api/reseller/upload-asset.
--
-- SECURITY MODEL (mirrors brand-logos):
--   * Writes are performed exclusively server-side by the service-role client
--     (supabaseAdmin). Service role bypasses RLS, so no INSERT/UPDATE policy
--     is required.
--   * The bucket is PUBLIC so Supabase's storage layer serves stable public
--     URLs without SELECT policies or signed tokens.
--   * Explicit RLS policies on storage.objects are intentionally omitted for
--     the same ownership reasons documented in the brand-logos migration.

-- Create the bucket (idempotent; safe to re-run).
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'widget-assets',
  'widget-assets',
  true,
  10485760                              -- 10 MB hard cap (mirrors the API route gate)
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;
