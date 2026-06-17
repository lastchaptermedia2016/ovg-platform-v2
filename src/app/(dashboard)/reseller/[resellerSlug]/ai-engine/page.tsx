import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AIEngineStudio } from "@/components/reseller/AIEngineStudio";
import { AiEngineCommandRegistrar } from "@/components/ai-engine/AiEngineCommandRegistrar";

// ──────────────────────────────────────────────
// Data shape for tenants passed to the workspace
// ──────────────────────────────────────────────
interface TenantSummary {
  id: string;
  name: string;
  category: string | null;
}

// ──────────────────────────────────────────────
// Resolver: Authenticate, authorize, resolve PK
// ──────────────────────────────────────────────
async function authorizeAndResolveResellerId(
  resellerSlug: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("OVG-PLATFORM-V2 [ai-engine]: No authenticated user");
    return null;
  }

  let resellerId: string | null = null;

  // Slug lookup with user session
  const { data: slugResult } = await supabase
    .from("resellers")
    .select("id")
    .eq("slug", resellerSlug)
    .maybeSingle();
  if (slugResult) {
    resellerId = slugResult.id;
  } else {
    const { data: tenantResult } = await supabase
      .from("resellers")
      .select("id")
      .eq("tenant_id", resellerSlug)
      .maybeSingle();
    if (tenantResult) resellerId = tenantResult.id;
  }

  if (!resellerId) {
    const { data: adminSlugResult } = await supabaseAdmin
      .from("resellers")
      .select("id")
      .eq("slug", resellerSlug)
      .maybeSingle();
    if (adminSlugResult) {
      resellerId = adminSlugResult.id;
    } else {
      const { data: adminTenantResult } = await supabaseAdmin
        .from("resellers")
        .select("id")
        .eq("tenant_id", resellerSlug)
        .maybeSingle();
      if (adminTenantResult) resellerId = adminTenantResult.id;
    }
  }

  if (!resellerId) {
    console.error("OVG-PLATFORM-V2 [ai-engine]: Reseller not found", resellerSlug);
    return null;
  }

  // Authorize via user_resellers
  const { data: userLink } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (userLink) return resellerId;

  const { data: adminLink } = await supabaseAdmin
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", user.id)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (!adminLink) {
    console.error("OVG-PLATFORM-V2 [ai-engine]: Not authorized", user.id, resellerSlug);
    return null;
  }

  return resellerId;
}

// ──────────────────────────────────────────────
// Fetch tenant summaries
// ──────────────────────────────────────────────
async function fetchTenants(resellerId: string): Promise<TenantSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, category")
    .eq("reseller_id", resellerId)
    .order("name", { ascending: true });

  if (error) {
    console.error("OVG-PLATFORM-V2 [ai-engine]: Tenant fetch failed", error);
    return [];
  }

  return (data ?? []) as TenantSummary[];
}

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────
export default async function AIEnginePage({
  params,
}: {
  params: Promise<{ resellerSlug: string }>;
}) {
  const { resellerSlug } = await params;

  const resellerId = await authorizeAndResolveResellerId(resellerSlug);
  if (!resellerId) {
    redirect("/auth");
  }

  const tenants = await fetchTenants(resellerId);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        {/* Back to Clients Navigation */}
        <Link
          href={`/reseller/${resellerSlug}/clients`}
          className="text-white/60 hover:text-white/100 text-sm flex items-center gap-2 mb-6 transition-all duration-200 w-fit"
        >
          <span aria-hidden="true">←</span>
          Back to Clients
        </Link>

        <AiEngineCommandRegistrar />
        <AIEngineStudio
          tenants={tenants}
          resellerSlug={resellerSlug}
        />
      </div>
    </div>
  );
}