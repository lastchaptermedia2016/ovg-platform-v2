import { NextRequest, NextResponse } from "next/server";
import { createAuthClient, getAuthenticatedUser, unauthorizedResponse, validateTenantOwnership } from "@/lib/auth/server";
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
// POST — Update tenant pricing and add-ons
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── STEP 1: Authenticate user ───────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) return unauthorizedResponse();

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
    const supabase = await createAuthClient();

    // ── STEP 3: Double-lock tenant ownership verification ──
    const ownership = await validateTenantOwnership(userId, tenantId);

    if (!ownership) {
      return NextResponse.json(
        { success: false, error: "Forbidden - tenant access denied" },
        { status: 403 },
      );
    }

    // ── STEP 4: Compute and apply scoped mutation ──
    // Compute the new retail MRR server-side
    const newMrr = computeNewMrr(planTier, indicators);

    // Explicit ownership filter appended to mutation
    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        plan_tier: planTier,
        indicators,
        mrr: newMrr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId)
      .eq("reseller_id", ownership.resellerId);

    if (updateError) {
      console.error("Database error:", updateError.message);

      return NextResponse.json(
        { success: false, error: "Database write failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      newMrr,
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Unexpected error:", errorMessage);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: errorMessage },
      { status: 500 },
    );
  }
}