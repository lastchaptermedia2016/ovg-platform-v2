import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { PLAN_TIER_COSTS, ADDON_COSTS } from "@/config/pricing";

// ──────────────────────────────────────────────
// Request validation schema
// ──────────────────────────────────────────────
const UpdatePricingSchema = z.object({
  tenantId: z.string().uuid(),
  planTier: z.enum(["standard", "premium", "enterprise"]),
  indicators: z.object({
    sms: z.enum(["active", "inactive"]),
    signal: z.enum(["active", "inactive"]),
  }),
});

// ──────────────────────────────────────────────
// Server-side MRR calculator
// Computed from the authoritative pricing config,
// NOT from the client payload — prevents tampering.
// ──────────────────────────────────────────────
function computeNewMrr(
  planTier: "standard" | "premium" | "enterprise",
  indicators: { sms: "active" | "inactive"; signal: "active" | "inactive" },
): string {
  const planRetail = PLAN_TIER_COSTS[planTier]?.suggestedRetail ?? 0;
  const whatsappAddon =
    indicators.sms === "active" ? ADDON_COSTS.whatsapp.retail : 0;
  const signalsAddon =
    indicators.signal === "active" ? ADDON_COSTS.highVolumeSignals.retail : 0;

  return String(planRetail + whatsappAddon + signalsAddon);
}

// ──────────────────────────────────────────────
// Double-lock ownership verification
// Validates that authenticated user owns/reseller for the tenant
// ──────────────────────────────────────────────
async function validateTenantOwnership(
  userId: string,
  tenantId: string,
): Promise<{ resellerId: string } | null> {
  const supabase = await createClient();

  // Resolve tenant to get its reseller_id
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("reseller_id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant?.reseller_id) {
    return null;
  }

  // Verify user has access to this reseller via user_resellers junction
  const { data: userReseller } = await supabase
    .from("user_resellers")
    .select("reseller_id")
    .eq("user_id", userId)
    .eq("reseller_id", tenant.reseller_id)
    .maybeSingle();

  if (!userReseller) {
    return null;
  }

  return { resellerId: tenant.reseller_id };
}

// ──────────────────────────────────────────────
// POST — Update tenant pricing and add-ons
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── STEP 1: Session Validation ─────────────────
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access path" },
        { status: 401 },
      );
    }

    // ── STEP 2: Parse and validate request body ─────
    const body = await request.json();
    const validationResult = UpdatePricingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request parameters",
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { tenantId, planTier, indicators } = validationResult.data;

    // ── STEP 3: Double-lock tenant ownership verification ──
    const ownership = await validateTenantOwnership(session.user.id, tenantId);

    if (!ownership) {
      return NextResponse.json(
        { success: false, error: "Forbidden - tenant access denied" },
        { status: 403 },
      );
    }

    // ── STEP 4: Compute and apply scoped mutation ──
    // Compute the new retail MRR server-side
    const newMrr = computeNewMrr(planTier, indicators);

    console.log("=== UPDATE PRICING REQUEST ===");
    console.log("tenantId:", tenantId);
    console.log("resellerId (validated):", ownership.resellerId);
    console.log("planTier:", planTier);
    console.log("indicators:", JSON.stringify(indicators));
    console.log("computedMrr:", newMrr);

    // Explicit ownership filter appended to mutation
    const { error } = await supabase
      .from("tenants")
      .update({
        plan_tier: planTier,
        indicators,
        mrr: newMrr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId)
      .eq("reseller_id", ownership.resellerId);

    if (error) {
      console.error("=== UPDATE PRICING ERROR ===");
      console.error("Database error:", error.message);

      return NextResponse.json(
        { success: false, error: "Database write failed" },
        { status: 500 },
      );
    }

    console.log("=== UPDATE PRICING SUCCESS ===");
    console.log("newMrr:", newMrr);

    return NextResponse.json({
      success: true,
      newMrr,
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("=== UPDATE PRICING UNEXPECTED ERROR ===", errorMessage);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: errorMessage },
      { status: 500 },
    );
  }
}