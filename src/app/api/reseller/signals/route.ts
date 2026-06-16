import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────
// GET — Fetch signal telemetry for a reseller
// Query params: resellerSlug (required)
// ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const resellerSlug = searchParams.get("resellerSlug");

    if (!resellerSlug) {
      return NextResponse.json(
        { success: false, error: "Missing resellerSlug query parameter" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Resolve reseller ID — try slug first, then tenant_id
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

    if (!resellerId) {
      return NextResponse.json(
        { success: false, error: "Reseller not found" },
        { status: 404 },
      );
    }

    // Resolve tenant IDs for this reseller
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("reseller_id", resellerId);

    const tenantIds = tenants?.map((t) => t.id) ?? [];
    const tenantNameMap = new Map(
      tenants?.map((t) => [t.id, t.name]) ?? [],
    );

    if (tenantIds.length === 0) {
      return NextResponse.json({
        success: true,
        signals: [],
        tenantNames: Object.fromEntries(tenantNameMap),
      });
    }

    // Fetch signal logs sorted by descending created_at
    const { data: signals, error: signalsError } = await supabase
      .from("tenant_logs")
      .select("*")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false })
      .limit(250);

    if (signalsError) {
      // Fallback to admin client
      const { data: adminSignals, error: adminError } = await supabaseAdmin
        .from("tenant_logs")
        .select("*")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: false })
        .limit(250);

      if (adminError) {
        console.error("Signal fetch error:", adminError.message);
        return NextResponse.json(
          { success: false, error: "Database query failed" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        signals: adminSignals ?? [],
        tenantNames: Object.fromEntries(tenantNameMap),
      });
    }

    return NextResponse.json({
      success: true,
      signals: signals ?? [],
      tenantNames: Object.fromEntries(tenantNameMap),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Signals API error:", msg);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}