import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BrandingFooter } from "@/components/reseller/BrandingFooter";
import { HannahProvider } from "@/contexts/HannahContext";
import { CommandDeckProvider } from "@/contexts/CommandDeckContext";
import { CommandDeckPortal } from "@/components/hannah/CommandDeckPortal";
import { GlobalPTTListener } from "@/components/reseller/GlobalPTTListener";

// Production Excellence: Critical Security - Server-side Authorization Check
async function verifyResellerAccess(resellerSlug: string) {
  try {
    const supabase = await createClient();

    // STEP 1: Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("OVG-PLATFORM-V2: AUTH ERROR - No authenticated user found");
      return { authorized: false, redirectTo: "/auth" };
    }

    // STEP 2: Resolve the reseller record to get the internal PK.
    // Sequential resolution: try slug first, then fall back to tenant_id.
    // This avoids PostgREST .or() edge cases and works regardless of which
    // column (or both) exist in the current schema.
    //
    // 🔒 SECURITY CONTRACT:
    // Even though supabaseAdmin bypasses RLS here to resolve the reseller ID, that ID
    // is immediately locked to the authenticated user via the user_resellers check in
    // STEP 3 below. The service role is NEVER used to fetch user-scoped data — only
    // to resolve the bare primary key from a URL identifier. All data access beyond
    // this point is gated by (user.id, reseller.id) pairs in the user_resellers table.
    let reseller: { id: string } | null = null;

    // 1a — Try slug lookup with user session
    const { data: slugResult } = await supabase
      .from('resellers')
      .select('id')
      .eq('slug', resellerSlug)
      .maybeSingle();

    if (slugResult) {
      reseller = slugResult;
    } else {
      // 1b — Fallback to tenant_id lookup with user session
      const { data: tenantResult } = await supabase
        .from('resellers')
        .select('id')
        .eq('tenant_id', resellerSlug)
        .maybeSingle();

      if (tenantResult) {
        reseller = tenantResult;
      }
    }

    if (!reseller) {
      // 2a — Try slug lookup with service role (RLS fallback)
      console.log(
        "OVG-PLATFORM-V2: User-session reseller resolution failed, trying service-role fallback",
      );
      const { data: adminSlugResult } = await supabaseAdmin
        .from('resellers')
        .select('id')
        .eq('slug', resellerSlug)
        .maybeSingle();

      if (adminSlugResult) {
        reseller = adminSlugResult;
      } else {
        // 2b — Fallback to tenant_id lookup with service role
        const { data: adminTenantResult } = await supabaseAdmin
          .from('resellers')
          .select('id')
          .eq('tenant_id', resellerSlug)
          .maybeSingle();

        reseller = adminTenantResult;
      }
    }

    if (!reseller) {
      console.error(
        "OVG-PLATFORM-V2: Reseller not found for identifier:",
        resellerSlug,
      );
      return { authorized: false, redirectTo: "/auth" };
    }

    // STEP 3: Authorize — verify the user is linked to this reseller via user_resellers.
    // The user_resellers table has an RLS policy allowing auth.uid() = user_id,
    // so the user-session client can read their own relationships.
    let authorized = false;

    const { data: userLink } = await supabase
      .from('user_resellers')
      .select('reseller_id, role')
      .eq('user_id', user.id)
      .eq('reseller_id', reseller.id)
      .maybeSingle();

    if (userLink) {
      authorized = true;
    } else {
      // Fallback: service-role can read all junction rows
      const { data: adminLink } = await supabaseAdmin
        .from('user_resellers')
        .select('reseller_id, role')
        .eq('user_id', user.id)
        .eq('reseller_id', reseller.id)
        .maybeSingle();

      authorized = !!adminLink;
    }

    if (!authorized) {
      console.error(
        "OVG-PLATFORM-V2: User",
        user.id,
        "not authorized for reseller",
        resellerSlug,
      );
      return { authorized: false, redirectTo: "/auth" };
    }

    console.log(
      "OVG-PLATFORM-V2: user_resellers auth passed for user",
      user.id,
      "reseller",
      resellerSlug,
    );
    return { authorized: true, redirectTo: null };

  } catch (error) {
    console.error("OVG-PLATFORM-V2: CRITICAL SECURITY ERROR:", error);
    return { authorized: false, redirectTo: "/auth" };
  }
}

export default async function ResellerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ resellerSlug: string }>;
}) {
  // Production Excellence: Execute security check before any rendering
  const { resellerSlug } = await params;
  const securityCheck = await verifyResellerAccess(resellerSlug);

  // Critical Security: Redirect unauthorized access immediately
  if (!securityCheck.authorized && securityCheck.redirectTo) {
    redirect(securityCheck.redirectTo);
  }

  return (
    <>
      {/* Fixed Background Lock - Original Background */}
      <div
        className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10]"
        style={{
          backgroundImage: "url('/reseller-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top 20%',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          backgroundColor: '#000',
        }}
      />

{/* Dashboard Spine */}
       <div className="w-full flex flex-col items-center overflow-x-hidden relative min-h-screen">
          <div className="relative z-10 flex flex-col w-full">
            {/* Main Content - Page handles its own header */}
            <main className="w-full">
              <CommandDeckProvider>
                <HannahProvider resellerSlug={resellerSlug}>
                  <GlobalPTTListener />
                  <CommandDeckPortal />
                  {children}
                </HannahProvider>
              </CommandDeckProvider>
            </main>

            {/* Footer */}
            <div className="w-full flex justify-center">
              <BrandingFooter />
            </div>
          </div>
        </div>
    </>
  );
}