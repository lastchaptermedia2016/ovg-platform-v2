import { createClient } from "@/lib/supabase/server";
import { TenantSchema, type Tenant } from "@/types/database";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type { Tenant };

// Safe parse function that returns null on validation errors
export function safeParseTenant(data: unknown): Tenant | null {
  const result = TenantSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error("Tenant validation error:", result.error);
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTenantBySlug(
  identifier: string,
  supabaseClient?: SupabaseClient,
): Promise<Tenant | null> {
  try {
    const supabase = supabaseClient ?? (await createClient());
    const trimmed = identifier.trim();

    if (!trimmed) {
      return null;
    }

    const isUuid = UUID_REGEX.test(trimmed);

    const query = supabase.from("tenants").select("*");

    if (isUuid) {
      query.or(`id.eq.${trimmed},tenant_id.eq.${trimmed}`);
    } else {
      query.eq("tenant_id", trimmed);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error(`Error fetching tenant by identifier "${trimmed}":`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    const validatedTenant = safeParseTenant(data);
    return validatedTenant;
  } catch (error) {
    console.error(`Unexpected error fetching tenant "${identifier}"`, error);
    return null;
  }
}

/**
 * Anonymous-safe loader for the public widget embed.
 *
 * The public embed has no session, so the server anon client cannot read
 * `tenants` directly (RLS only grants authenticated resellers). This calls the
 * SECURITY DEFINER RPC `get_public_widget_config`, which returns ONLY the
 * `branding` and `suggestedActions` subtrees of `widget_config` — never PII,
 * integration secrets, or AI prompts. Returns null when the tenant_id is
 * unknown so the caller can `notFound()`.
 */
export async function getPublicWidgetConfig(
  tenantId: string
): Promise<{ widget_config: import("@/lib/schemas/tenant-config.canonical").CanonicalWidgetConfig } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("get_public_widget_config", { p_tenant_id: tenantId })
      .maybeSingle();

    if (error) {
      const isDebug = process.env.NODE_ENV !== "production" || process.env.DEBUG_SUPABASE === "true";
      const safe = {
        message: (error as PostgrestError)?.message,
        code: (error as PostgrestError)?.code,
      };

      if (isDebug) {
        // Include non-enumerable PostgrestError properties only in debug.
        const errorProps = JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.error(`Error loading public widget config for "${tenantId}":`, {
          ...safe,
          details: (error as PostgrestError)?.details,
          hint: (error as PostgrestError)?.hint,
          serialized: errorProps,
        });
      } else {
        console.error(`Error loading public widget config for "${tenantId}":`, safe);
      }
      return null;
    }
    if (!data) return null;
    return data as { widget_config: import("@/lib/schemas/tenant-config.canonical").CanonicalWidgetConfig };
  } catch (error) {
    console.error(`Unexpected error loading public widget config for "${tenantId}":`, error);
    return null;
  }
}
