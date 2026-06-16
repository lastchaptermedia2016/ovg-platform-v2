import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClientOnboardingWizard } from "@/components/reseller/ClientOnboardingWizard";

// ──────────────────────────────────────────────
// Auth + resolve reseller PK
// ──────────────────────────────────────────────
async function authorizeAndResolveResellerId(
  resellerSlug: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  let resellerId: string | null = null;

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
    const { data: adminSlug } = await supabaseAdmin
      .from("resellers")
      .select("id")
      .eq("slug", resellerSlug)
      .maybeSingle();
    if (adminSlug) {
      resellerId = adminSlug.id;
    } else {
      const { data: adminTenant } = await supabaseAdmin
        .from("resellers")
        .select("id")
        .eq("tenant_id", resellerSlug)
        .maybeSingle();
      if (adminTenant) resellerId = adminTenant.id;
    }
  }

  if (!resellerId) return null;

  // Authorize
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

  return adminLink ? resellerId : null;
}

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────
export default async function ClientNewPage({
  params,
}: {
  params: Promise<{ resellerSlug: string }>;
}) {
  const { resellerSlug } = await params;

  const resellerId = await authorizeAndResolveResellerId(resellerSlug);
  if (!resellerId) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        {/* Back to Clients */}
        <Link
          href={`/reseller/${resellerSlug}/clients`}
          className="text-white/60 hover:text-white/100 text-sm flex items-center gap-2 mb-6 transition-all duration-200 w-fit"
        >
          <span aria-hidden="true">←</span>
          Back to Clients
        </Link>

        <ClientOnboardingWizard resellerSlug={resellerSlug} />
      </div>
    </div>
  );
}