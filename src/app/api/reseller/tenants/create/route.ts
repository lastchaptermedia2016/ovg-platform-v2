import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { getBlueprintForIndustry } from "@/config/ai-engine";

// ──────────────────────────────────────────────
// Request validation schema
// ──────────────────────────────────────────────
const CreateTenantSchema = z.object({
  resellerSlug: z.string().min(1),
  name: z.string().min(1, "Client name is required"),
  email: z.string().email("Valid email required").nullable().optional(),
  websiteUrl: z.string().url("Valid URL required").nullable().optional(),
  industry: z.enum(["HEALTHCARE", "AUTOMOTIVE", "GENERAL"]),
});

// ──────────────────────────────────────────────
// POST — Atomic tenant + ai_settings creation
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = CreateTenantSchema.safeParse(body);

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

    const { resellerSlug, name, email, websiteUrl, industry } =
      validationResult.data;

    const supabase = await createClient();

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Resolve reseller ID
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

    // Verify authorization
    const { data: userLink } = await supabase
      .from("user_resellers")
      .select("reseller_id")
      .eq("user_id", user.id)
      .eq("reseller_id", resellerId)
      .maybeSingle();

    if (!userLink) {
      const { data: adminLink } = await supabaseAdmin
        .from("user_resellers")
        .select("reseller_id")
        .eq("user_id", user.id)
        .eq("reseller_id", resellerId)
        .maybeSingle();

      if (!adminLink) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    const now = new Date().toISOString();

    // ── Step 1: Insert into tenants ──
    const widgetConfig = {
      branding: {
        primaryColor: "#0097b2",
        accentColor: "#D4AF37",
        logoUrl: "",
      },
      features: {
        aiInsightBadge: false,
        aiDesignMirror: false,
        customCss: false,
      },
    };

    const { data: tenantInsert, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        reseller_id: resellerId,
        name,
        email: email ?? null,
        website_url: websiteUrl ?? null,
        industry,
        category: industry === "AUTOMOTIVE" ? "AUTOMOTIVE" : "GENERAL BUSINESS",
        plan_tier: "standard",
        mrr: "2450",
        is_active: true,
        widget_config: widgetConfig,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (tenantError) {
      // Fallback with admin client
      const { data: adminInsert, error: adminTenantError } = await supabaseAdmin
        .from("tenants")
        .insert({
          reseller_id: resellerId,
          name,
          email: email ?? null,
          website_url: websiteUrl ?? null,
          industry,
          category: industry === "AUTOMOTIVE" ? "AUTOMOTIVE" : "GENERAL BUSINESS",
          plan_tier: "standard",
          mrr: "2450",
          is_active: true,
          widget_config: widgetConfig,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (adminTenantError || !adminInsert) {
        console.error("Tenant insert error:", adminTenantError?.message);
        return NextResponse.json(
          { success: false, error: "Failed to create tenant" },
          { status: 500 },
        );
      }

      // ── Step 2: Insert ai_settings ──
      const blueprint = getBlueprintForIndustry(industry);
      const { error: aiError } = await supabaseAdmin.from("ai_settings").insert({
        tenant_id: adminInsert.id,
        initial_greeting: blueprint.initial_greeting,
        voice_persona_tone: blueprint.voice_persona_tone,
        voice_vocabulary_style: blueprint.voice_vocabulary_style,
        synced_with_branding: false,
        updated_at: now,
      });

      if (aiError) {
        console.error("ai_settings insert error (admin):", aiError.message);
        // Non-fatal: tenant was created
      }

      return NextResponse.json({
        success: true,
        tenantId: adminInsert.id,
        writtenAt: now,
      });
    }

    if (!tenantInsert) {
      return NextResponse.json(
        { success: false, error: "Failed to create tenant" },
        { status: 500 },
      );
    }

    // ── Step 2: Insert ai_settings ──
    const blueprint = getBlueprintForIndustry(industry);
    const { error: aiError } = await supabase.from("ai_settings").insert({
      tenant_id: tenantInsert.id,
      initial_greeting: blueprint.initial_greeting,
      voice_persona_tone: blueprint.voice_persona_tone,
      voice_vocabulary_style: blueprint.voice_vocabulary_style,
      synced_with_branding: false,
      updated_at: now,
    });

    if (aiError) {
      // Admin fallback for ai_settings
      const { error: adminAiError } = await supabaseAdmin.from("ai_settings").insert({
        tenant_id: tenantInsert.id,
        initial_greeting: blueprint.initial_greeting,
        voice_persona_tone: blueprint.voice_persona_tone,
        voice_vocabulary_style: blueprint.voice_vocabulary_style,
        synced_with_branding: false,
        updated_at: now,
      });

      if (adminAiError) {
        console.error("ai_settings insert error:", adminAiError.message);
        // Non-fatal
      }
    }

    return NextResponse.json({
      success: true,
      tenantId: tenantInsert.id,
      writtenAt: now,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Create tenant error:", msg);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: msg },
      { status: 500 },
    );
  }
}