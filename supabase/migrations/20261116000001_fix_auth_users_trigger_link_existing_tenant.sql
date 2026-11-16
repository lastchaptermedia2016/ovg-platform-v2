-- Fix: Supabase "Database error saving new user" (500 unexpected_failure) on Client Portal signup
--
-- WHY:
--   When a client/tenant record is pre-created via the admin portal (resellers
--   portal "create client" flow writes a `tenants` row carrying the client's
--   email), the auth.users INSERT trigger must NOT blindly insert into
--   tenant-scoped tables. The previous trigger attempted a linking INSERT that
--   collided with the pre-provisioned row (unique/PK violation) or referenced
--   columns that were missing / NOT NULL without defaults, surfacing as
--   PostgREST 500 unexpected_failure.
--
-- WHAT THIS MIGRATION DOES:
--   1. (Re)creates the auth.users trigger function with
--      `SECURITY DEFINER SET search_path = public` so it runs with the
--      privileges needed to read tenant tables and cannot be bypassed by
--      search_path hijacking.
--   2. On NEW user insert, looks up a pre-provisioned tenant by email
--      (case-insensitive) and, if found, links the auth user to it via
--      user_resellers (idempotent — ON CONFLICT DO NOTHING).
--   3. For fresh signups with no pre-provisioned tenant, seeds a sensible
--      default tenant row so NOT NULL columns never fail the insert.
--   4. Re-points the auth user's app_metadata with the resolved tenant slug.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger function: handle_new_user
--    SECURITY DEFINER + pinned search_path + idempotent linking.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_reseller_id UUID;
  v_slug TEXT;
  v_email TEXT := lower(btrim(NEW.email));
BEGIN
  -- Resolve pre-provisioned tenant by email (case-insensitive).
  -- The admin portal pre-creates tenants with the client's email; we link
  -- the freshly created auth user to that existing tenant instead of failing.
  IF v_email IS NOT NULL THEN
    SELECT t.id, t.reseller_id
      INTO v_tenant_id, v_reseller_id
      FROM public.tenants t
     WHERE lower(btrim(t.email)) = v_email
     LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
      -- Link auth user -> reseller via the junction table (idempotent).
      INSERT INTO public.user_resellers (user_id, reseller_id, role, is_primary)
      VALUES (NEW.id, v_reseller_id, 'client', true)
      ON CONFLICT (user_id, reseller_id) DO NOTHING;

      -- Record the resolved tenant slug on the auth user metadata.
      NEW.raw_user_meta_data := jsonb_set(
        COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
        '{tenant_slug}',
        to_jsonb(COALESCE(
          (SELECT r.tenant_id FROM public.resellers r WHERE r.id = v_reseller_id),
          v_tenant_id::text
        ))
      );
    END IF;
  END IF;

  -- Fresh signup with no pre-provisioned tenant: create a default tenant so
  -- downstream NOT NULL columns never break the auth insert.
  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (
      tenant_id, name, email, reseller_id, is_active, created_at, updated_at
    )
    VALUES (
      COALESCE(
        lower(regexp_replace(COALESCE(NEW.raw_user_meta_data ->> 'reseller_slug', ''), '[^a-z0-9-]', '', 'g')),
        'client-' || substr(md5(NEW.email), 1, 12)
      ),
      COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Client ' || substr(md5(NEW.email), 1, 8)),
      NEW.email,
      NULL,
      true,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. (Re)create the auth.users trigger pointing at the fixed function.
--    AFTER INSERT so the auth row exists before linking.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants: trigger execution for the auth role + function usage.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;
