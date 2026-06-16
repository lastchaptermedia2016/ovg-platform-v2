import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientRevenueDashboard } from "@/components/reseller/ClientRevenueDashboard";

// ──────────────────────────────────────────────
// Data shape: Financial ledger row from tenants
// ──────────────────────────────────────────────
interface TenantLedgerRow {
  name: string;
  plan_tier: string | null;
  mrr: string | null;
  revenue_total: string | null;
  is_active: boolean;
  email: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Resolver: Authenticate, authorize, resolve PK
// ──────────────────────────────────────────────
async function authorizeAndResolveResellerId(
  resellerSlug: string,
): Promise<string | null> {
  const supabase = await createClient();

  // STEP 1 — Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error(
      "OVG-PLATFORM-V2 [revenue]: No authenticated user — redirecting",
    );
    return null;
  }

  // STEP 2 — Resolve reseller primary key from slug
  // User-session client first, then service-role fallback
  let resellerId: string | null = null;

  // 2a — Try slug lookup with user session
  const { data: slugResult } = await supabase
    .from("resellers")
    .select("id")
    .eq("slug", resellerSlug)
    .maybeSingle();

  if (slugResult) {
    resellerId = slugResult.id;
  } else {
    // 2b — Fallback to tenant_id lookup with user session
    const { data: tenantResult } = await supabase
      .from("resellers")
      .select("id")
      .eq("tenant_id", resellerSlug)
      .maybeSingle();

    if (tenantResult) {
      resellerId = tenantResult.id;
    }
  }

  if (!resellerId) {
    // 2c — Service-role fallback: slug
    const { data: adminSlugResult } = await supabaseAdmin
      .from("resellers")
      .select("id")
      .eq("slug", resellerSlug)
      .maybeSingle();

    if (adminSlugResult) {
      resellerId = adminSlugResult.id;
    } else {
      // 2d — Service-role fallback: tenant_id
      const { data: adminTenantResult } = await supabaseAdmin
        .from("resellers")
        .select("id")
        .eq("tenant_id", resellerSlug)
        .maybeSingle();

      if (adminTenantResult) {
        resellerId = adminTenantResult.id;
      }
    }
  }

  if (!resellerId) {
    console.error(
      "OVG-PLATFORM-V2 [revenue]: Reseller not found for slug",
      resellerSlug,
    );
    return null;
  }

  // STEP 3 — Authorize via user_resellers junction
  const { data: userLink } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (userLink) {
    console.log(
      "OVG-PLATFORM-V2 [revenue]: Authorization passed for user",
      user.id,
      "reseller",
      resellerSlug,
    );
    return resellerId;
  }

  // 3b — Service-role fallback
  const { data: adminLink } = await supabaseAdmin
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  const authorized = !!adminLink;

  if (!authorized) {
    console.error(
      "OVG-PLATFORM-V2 [revenue]: User",
      user.id,
      "not authorized for reseller",
      resellerSlug,
    );
    return null;
  }

  console.log(
    "OVG-PLATFORM-V2 [revenue]: Service-role auth passed for user",
    user.id,
    "reseller",
    resellerSlug,
  );
  return resellerId;
}

// ──────────────────────────────────────────────
// Fetch tenant financial ledger from Supabase
// ──────────────────────────────────────────────
async function fetchTenantLedger(
  resellerId: string,
): Promise<TenantLedgerRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .select(
      "name, plan_tier, mrr, revenue_total, is_active, email, created_at",
    )
    .eq("reseller_id", resellerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "OVG-PLATFORM-V2 [revenue]: Tenant ledger fetch failed",
      error,
    );
    return [];
  }

  return (data ?? []) as TenantLedgerRow[];
}

// ──────────────────────────────────────────────
// Page Component — Server Component Entry
// ──────────────────────────────────────────────
export default async function RevenuePage({
  params,
}: {
  params: Promise<{ resellerSlug: string }>;
}) {
  const { resellerSlug } = await params;

  // Security gate — authenticate and authorize
  const resellerId = await authorizeAndResolveResellerId(resellerSlug);
  if (!resellerId) {
    redirect("/auth");
  }

  // Fetch tenant financial data
  const tenants = await fetchTenantLedger(resellerId);

  // Render dashboard shell with hydrated data
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <ClientRevenueDashboard
          initialTenants={tenants}
          resellerSlug={resellerSlug}
        />
      </div>
    </div>
  );
}