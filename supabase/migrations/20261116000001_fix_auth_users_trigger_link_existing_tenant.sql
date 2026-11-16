-- Fix: Supabase "Database error saving new user" (500 unexpected_failure) on Client Portal signup
--
-- WHY:
--   When a client/tenant record is pre-created via the admin portal (resellers
--   portal "create client" flow writes a `tenants` row carrying the client's
--   email), the auth.users INSERT trigger must link the new auth user to the
--   existing tenant via user_resellers. Any failure in that linking INSERT
--   (unique/PK violation, missing column, NOT NULL without default) previously
--   propagated out of the trigger and surfaced as PostgREST 500
--   unexpected_failure, blocking signup entirely.
--
-- WHAT THIS MIGRATION DOES:
--   1. (Re)creates the auth.users trigger function with
--      `SECURITY DEFINER SET search_path = public` so it runs with the
--      privileges needed to read tenant tables and cannot be bypassed by
--      search_path hijacking.
--   2. On NEW user insert, looks up a pre-provisioned tenant by email
--      (case-insensitive) and, if found, links the auth user to it via
--      user_resellers (idempotent — ON CONFLICT DO NOTHING).
--   3. The linking INSERT is wrapped in a BEGIN ... EXCEPTION WHEN others THEN
--      NULL block so a transient or constraint failure can never fail the
--      auth.users insert itself; signup always succeeds.
--   4. Re-points the auth.users trigger at the fixed function.
--   5. Drops the stale `on_auth_user_created_link_reseller` trigger and its
--      `handle_new_user_reseller_link` function, which referenced a
--      non-existent `reseller_users` table and caused unhandled exceptions
--      during auth.users INSERT (the source of the 500 unexpected_failure).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger function: handle_new_user
--    SECURITY DEFINER + pinned search_path + exception-safe idempotent linking.
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
  v_email TEXT := lower(btrim(NEW.email));
BEGIN
  IF v_email IS NOT NULL THEN
    SELECT t.id, t.reseller_id
      INTO v_tenant_id, v_reseller_id
      FROM public.tenants t
     WHERE lower(btrim(t.email)) = v_email
     LIMIT 1;

    IF v_tenant_id IS NOT NULL AND v_reseller_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.user_resellers (user_id, reseller_id, role, is_primary)
        VALUES (NEW.id, v_reseller_id, 'client', true)
        ON CONFLICT (user_id, reseller_id) DO NOTHING;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. (Re)create the auth.users trigger pointing at the fixed function.
--    AFTER INSERT so the auth row exists before linking.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TRIGGER IF EXISTS on_auth_user_created_link_reseller ON auth.users;

DROP FUNCTION IF EXISTS public.handle_new_user_reseller_link();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
