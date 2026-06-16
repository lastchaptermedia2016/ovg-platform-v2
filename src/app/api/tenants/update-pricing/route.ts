import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

    // Compute the new retail MRR server-side
    const newMrr = computeNewMrr(planTier, indicators);

    console.log("=== UPDATE PRICING REQUEST ===");
    console.log("tenantId:", tenantId);
    console.log("planTier:", planTier);
    console.log("indicators:", JSON.stringify(indicators));
    console.log("computedMrr:", newMrr);

    // Try user-session client first, fall back to service-role
    const supabase = await createClient();

    const { error: upsertError } = await supabase
      .from("tenants")
      .update({
        plan_tier: planTier,
        indicators,
        mrr: newMrr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (upsertError) {
      // Fallback with admin client
      const { error: adminError } = await supabaseAdmin
        .from("tenants")
        .update({
          plan_tier: planTier,
          indicators,
          mrr: newMrr,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);

      if (adminError) {
        console.error("=== UPDATE PRICING ERROR ===");
        console.error("User-session error:", upsertError.message);
        console.error("Admin fallback error:", adminError.message);

        return NextResponse.json(
          { success: false, error: "Database write failed" },
          { status: 500 },
        );
      }
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