import { NextRequest, NextResponse } from "next/server";
import { createAuthClient, getAuthenticatedUser, unauthorizedResponse, validateTenantOwnership } from "@/lib/auth/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// Request validation schema
// ──────────────────────────────────────────────
const UpdateAIEngineSchema = z.object({
  tenantId: z.string().uuid(),
  initialGreeting: z.string().nullable(),
  voicePersonaTone: z.string().nullable(),
  voiceVocabularyStyle: z.string().nullable(),
  syncedWithBranding: z.boolean(),
});

// ──────────────────────────────────────────────
// POST — Upsert ai_settings for a tenant
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── STEP 1: Authenticate user ───────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) return unauthorizedResponse();

    // ── STEP 2: Parse and validate request body ─────
    const body = await request.json();
    const validationResult = UpdateAIEngineSchema.safeParse(body);

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

    const { tenantId, initialGreeting, voicePersonaTone, voiceVocabularyStyle, syncedWithBranding } =
      validationResult.data;
    const supabase = await createAuthClient();

    // ── STEP 3: Double-lock tenant ownership verification ──
    const ownership = await validateTenantOwnership(userId, tenantId);

    if (!ownership) {
      return NextResponse.json(
        { success: false, error: "Forbidden - tenant access denied" },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();

    console.log("=== UPDATE AI ENGINE REQUEST ===");
    console.log("tenantId:", tenantId);
    console.log("resellerId (validated):", ownership.resellerId);
    console.log("initialGreeting length:", initialGreeting?.length ?? 0);
    console.log("voicePersonaTone length:", voicePersonaTone?.length ?? 0);
    console.log("voiceVocabularyStyle length:", voiceVocabularyStyle?.length ?? 0);
    console.log("syncedWithBranding:", syncedWithBranding);

    // ── STEP 4: Scoped mutation with explicit reseller context ──
    const { error: upsertError } = await supabase
      .from("ai_settings")
      .upsert(
        {
          tenant_id: tenantId,
          initial_greeting: initialGreeting,
          voice_persona_tone: voicePersonaTone,
          voice_vocabulary_style: voiceVocabularyStyle,
          synced_with_branding: syncedWithBranding,
          updated_at: now,
        },
        { onConflict: "tenant_id" },
      );

    if (upsertError) {
      console.error("=== UPDATE AI ENGINE ERROR ===");
      console.error("Database error:", upsertError.message);

      return NextResponse.json(
        { success: false, error: "Database write failed" },
        { status: 500 },
      );
    }

    console.log("=== UPDATE AI ENGINE SUCCESS ===");
    console.log("writtenAt:", now);

    return NextResponse.json({
      success: true,
      writtenAt: now,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("=== UPDATE AI ENGINE UNEXPECTED ERROR ===", errorMessage);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: errorMessage },
      { status: 500 },
    );
  }
}